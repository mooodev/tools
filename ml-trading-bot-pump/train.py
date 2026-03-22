"""
Autoresearch training script for pump.fun token trading.
This file IS the mutable experiment target — the autoresearch agent modifies
this file to explore architectures, hyperparameters, and trading strategies.

Optimized for Apple Silicon via MLX.
Run: uv run train.py   (or: python train.py)
"""

import time
import math
import json
import mlx.core as mx
import mlx.nn as nn
import mlx.optimizers as optim
import numpy as np
from pathlib import Path

from prepare import prepare_data, simulate_trading, NUM_FEATURES

METRICS_FILE = Path(__file__).parent / "metrics.jsonl"

# ── Hyperparameters (MUTABLE — autoresearch tunes these) ─────────────────────

WINDOW_SIZE = 24          # lookback window in candles (hours)
FORECAST_HORIZON = 1      # predict N candles ahead
BATCH_SIZE = 64
LEARNING_RATE = 1e-3
WEIGHT_DECAY = 1e-4
TIME_BUDGET = 300         # 5 minutes per experiment
HIDDEN_DIM = 64
NUM_LAYERS = 3
NUM_HEADS = 4
DROPOUT = 0.1
TRADE_THRESHOLD = 0.0     # go long when prediction > this


# ── Metrics Logging ─────────────────────────────────────────────────────────

def log_metrics(data):
    """Append a JSON line to metrics.jsonl for the dashboard."""
    with open(METRICS_FILE, "a") as f:
        f.write(json.dumps(data) + "\n")


# ── Model Architecture (MUTABLE) ────────────────────────────────────────────

class CandleAttention(nn.Module):
    """Multi-head self-attention over candle windows."""
    def __init__(self, dim, num_heads):
        super().__init__()
        self.num_heads = num_heads
        self.head_dim = dim // num_heads
        self.qkv = nn.Linear(dim, 3 * dim)
        self.out_proj = nn.Linear(dim, dim)
        self.scale = math.sqrt(self.head_dim)

    def __call__(self, x):
        B, T, D = x.shape
        qkv = self.qkv(x)
        qkv = qkv.reshape(B, T, 3, self.num_heads, self.head_dim)
        qkv = qkv.transpose(0, 3, 2, 1, 4)  # (B, H, 3, T, head_dim)
        q, k, v = qkv[:, :, 0], qkv[:, :, 1], qkv[:, :, 2]

        attn = (q @ k.transpose(0, 1, 3, 2)) / self.scale
        # Causal mask — only attend to past candles
        mask = mx.triu(mx.full((T, T), -1e9), k=1)
        attn = attn + mask
        attn = mx.softmax(attn, axis=-1)

        out = attn @ v
        out = out.transpose(0, 2, 1, 3).reshape(B, T, D)
        return self.out_proj(out)


class TransformerBlock(nn.Module):
    def __init__(self, dim, num_heads, dropout=0.1):
        super().__init__()
        self.attn = CandleAttention(dim, num_heads)
        self.ln1 = nn.LayerNorm(dim)
        self.ln2 = nn.LayerNorm(dim)
        self.ffn = nn.Sequential(
            nn.Linear(dim, dim * 4),
            nn.GELU(),
            nn.Linear(dim * 4, dim),
        )
        self.drop = nn.Dropout(dropout)

    def __call__(self, x):
        x = x + self.drop(self.attn(self.ln1(x)))
        x = x + self.drop(self.ffn(self.ln2(x)))
        return x


class TradingTransformer(nn.Module):
    """
    Small transformer that reads a window of candle features
    and outputs a scalar prediction (expected future return).
    """
    def __init__(self, num_features=NUM_FEATURES, window_size=WINDOW_SIZE,
                 hidden_dim=HIDDEN_DIM, num_layers=NUM_LAYERS,
                 num_heads=NUM_HEADS, dropout=DROPOUT):
        super().__init__()
        self.input_proj = nn.Linear(num_features, hidden_dim)
        self.pos_embed = mx.zeros((1, window_size, hidden_dim))  # learned
        self.blocks = [
            TransformerBlock(hidden_dim, num_heads, dropout)
            for _ in range(num_layers)
        ]
        self.ln_final = nn.LayerNorm(hidden_dim)
        self.head = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.GELU(),
            nn.Linear(hidden_dim // 2, 1),
        )

    def __call__(self, x):
        # x: (B, window_size, num_features)
        x = self.input_proj(x) + self.pos_embed
        for block in self.blocks:
            x = block(x)
        x = self.ln_final(x)
        # Use last timestep's representation
        x = x[:, -1, :]
        return self.head(x).squeeze(-1)  # (B,)


# ── Training Loop ───────────────────────────────────────────────────────────

def make_batches(X, y, batch_size, shuffle=True):
    """Yield batches from dataset."""
    n = X.shape[0]
    indices = np.arange(n)
    if shuffle:
        np.random.shuffle(indices)
    for start in range(0, n, batch_size):
        idx = indices[start:start + batch_size]
        yield X[idx], y[idx]


def train():
    print("=" * 60)
    print("AUTORESEARCH — Pump.fun Trading Bot (MLX)")
    print("=" * 60)

    # Clear metrics file
    METRICS_FILE.write_text("")

    # ── Data ──
    data = prepare_data(window_size=WINDOW_SIZE, horizon=FORECAST_HORIZON)
    X_train, y_train = data["X_train"], data["y_train"]
    X_val, y_val = data["X_val"], data["y_val"]

    print(f"\nModel config: hidden={HIDDEN_DIM}, layers={NUM_LAYERS}, "
          f"heads={NUM_HEADS}, dropout={DROPOUT}")
    print(f"Training config: lr={LEARNING_RATE}, wd={WEIGHT_DECAY}, "
          f"batch={BATCH_SIZE}, budget={TIME_BUDGET}s")

    # ── Model ──
    model = TradingTransformer(
        num_features=NUM_FEATURES,
        window_size=WINDOW_SIZE,
        hidden_dim=HIDDEN_DIM,
        num_layers=NUM_LAYERS,
        num_heads=NUM_HEADS,
        dropout=DROPOUT,
    )
    mx.eval(model.parameters())

    # Count params
    def count_params(params):
        total = 0
        if isinstance(params, dict):
            for v in params.values():
                total += count_params(v)
        elif isinstance(params, list):
            for v in params:
                total += count_params(v)
        elif isinstance(params, mx.array):
            total += params.size
        return total

    n_params = count_params(model.parameters())
    print(f"Model parameters: {n_params:,}")

    # ── Optimizer ──
    optimizer = optim.AdamW(
        learning_rate=LEARNING_RATE,
        weight_decay=WEIGHT_DECAY,
    )

    # ── Loss function ──
    def loss_fn(model, X_batch, y_batch):
        preds = model(X_batch)
        # MSE loss on return prediction
        mse = mx.mean((preds - y_batch) ** 2)
        # Directional bonus: reward correct sign prediction
        direction_correct = (preds * y_batch) > 0
        direction_bonus = mx.mean(direction_correct.astype(mx.float32))
        # Combined loss: MSE with directional incentive
        return mse - 0.01 * direction_bonus

    loss_and_grad = nn.value_and_grad(model, loss_fn)

    # ── Training ──
    start_time = time.time()
    epoch = 0
    best_val_sharpe = -float("inf")
    best_epoch = 0
    train_losses = []

    print(f"\nTraining for up to {TIME_BUDGET}s...")
    print("-" * 60)

    while True:
        elapsed = time.time() - start_time
        if elapsed >= TIME_BUDGET:
            break

        epoch += 1
        epoch_loss = 0.0
        n_batches = 0

        model.train()
        for X_batch, y_batch in make_batches(X_train, y_train, BATCH_SIZE):
            if time.time() - start_time >= TIME_BUDGET:
                break
            loss, grads = loss_and_grad(model, X_batch, y_batch)
            optimizer.update(model, grads)
            mx.eval(model.parameters(), optimizer.state)
            epoch_loss += loss.item()
            n_batches += 1

        avg_loss = epoch_loss / max(n_batches, 1)
        train_losses.append(avg_loss)

        # Log every epoch (loss only)
        metric_entry = {
            "epoch": epoch,
            "train_loss": round(avg_loss, 8),
            "elapsed": round(time.time() - start_time, 1),
        }

        # ── Validation ──
        if epoch % 5 == 0 or time.time() - start_time >= TIME_BUDGET * 0.95:
            model.eval()
            val_preds = []
            for X_batch, _ in make_batches(X_val, y_val, BATCH_SIZE, shuffle=False):
                preds = model(X_batch)
                val_preds.append(preds)
            val_preds = mx.concatenate(val_preds)
            mx.eval(val_preds)

            # Trading simulation
            metrics = simulate_trading(val_preds, y_val, threshold=TRADE_THRESHOLD)

            elapsed = time.time() - start_time
            print(f"Epoch {epoch:3d} | loss={avg_loss:.6f} | "
                  f"sharpe={metrics['sharpe']:+.4f} | "
                  f"return={metrics['total_return']:+.6f} | "
                  f"win={metrics['win_rate']:.2%} | "
                  f"trades={metrics['n_trades']} | "
                  f"{elapsed:.0f}s")

            if metrics["sharpe"] > best_val_sharpe:
                best_val_sharpe = metrics["sharpe"]
                best_epoch = epoch

            # Add val metrics to log entry
            metric_entry.update({
                "val_sharpe": metrics["sharpe"],
                "val_total_return": metrics["total_return"],
                "val_win_rate": metrics["win_rate"],
                "val_n_trades": metrics["n_trades"],
                "val_max_drawdown": metrics["max_drawdown"],
            })

        log_metrics(metric_entry)

    # ── Final Evaluation ──
    print("\n" + "=" * 60)
    print("FINAL EVALUATION")
    print("=" * 60)

    model.eval()
    # Training set
    train_preds = []
    for X_batch, _ in make_batches(X_train, y_train, BATCH_SIZE, shuffle=False):
        preds = model(X_batch)
        train_preds.append(preds)
    train_preds = mx.concatenate(train_preds)
    mx.eval(train_preds)
    train_metrics = simulate_trading(train_preds, y_train, threshold=TRADE_THRESHOLD)

    # Validation set
    val_preds = []
    for X_batch, _ in make_batches(X_val, y_val, BATCH_SIZE, shuffle=False):
        preds = model(X_batch)
        val_preds.append(preds)
    val_preds = mx.concatenate(val_preds)
    mx.eval(val_preds)
    val_metrics = simulate_trading(val_preds, y_val, threshold=TRADE_THRESHOLD)

    total_time = time.time() - start_time

    print(f"\nTrain: sharpe={train_metrics['sharpe']:+.4f} "
          f"return={train_metrics['total_return']:+.6f} "
          f"win={train_metrics['win_rate']:.2%} "
          f"trades={train_metrics['n_trades']}")
    print(f"Val:   sharpe={val_metrics['sharpe']:+.4f} "
          f"return={val_metrics['total_return']:+.6f} "
          f"win={val_metrics['win_rate']:.2%} "
          f"trades={val_metrics['n_trades']}")
    print(f"\nBest val sharpe: {best_val_sharpe:+.4f} at epoch {best_epoch}")
    print(f"Total time: {total_time:.1f}s | Epochs: {epoch}")
    print(f"Max drawdown (val): {val_metrics['max_drawdown']:.6f}")
    print(f"Parameters: {n_params:,}")

    # Log final summary
    log_metrics({
        "epoch": epoch,
        "final": True,
        "train_loss": round(train_losses[-1], 8) if train_losses else 0,
        "train_sharpe": train_metrics["sharpe"],
        "train_total_return": train_metrics["total_return"],
        "train_win_rate": train_metrics["win_rate"],
        "train_n_trades": train_metrics["n_trades"],
        "val_sharpe": val_metrics["sharpe"],
        "val_total_return": val_metrics["total_return"],
        "val_win_rate": val_metrics["win_rate"],
        "val_n_trades": val_metrics["n_trades"],
        "val_max_drawdown": val_metrics["max_drawdown"],
        "best_val_sharpe": best_val_sharpe,
        "best_epoch": best_epoch,
        "total_time": round(total_time, 1),
        "n_params": n_params,
        "elapsed": round(total_time, 1),
    })

    # ── Output for autoresearch ──
    # The primary metric is val_sharpe (higher = better)
    print(f"\n>>> val_sharpe {val_metrics['sharpe']:.4f}")

    return val_metrics


if __name__ == "__main__":
    train()
