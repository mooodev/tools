"""
Data preparation for pump.fun token candle trading.
Loads JSON candle files, engineers features, creates train/val splits.
This file is STATIC — do not modify during autoresearch experiments.
"""

import json
import os
import math
import mlx.core as mx
import numpy as np
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"
WINDOW_SIZE = 24          # 24 hours of lookback
FORECAST_HORIZON = 1      # predict 1 candle ahead
VAL_FRACTION = 0.2        # last 20% of each token's data for validation
MIN_CANDLES = 50          # minimum candles to use a token file

# ── Loading ──────────────────────────────────────────────────────────────────

def load_candle_files():
    """Load all JSON candle files from data/ directory."""
    files = sorted(DATA_DIR.glob("*.json"))
    if not files:
        raise FileNotFoundError(
            f"No JSON files found in {DATA_DIR}. "
            "Place pump.fun candle JSON files there first."
        )
    all_tokens = []
    for f in files:
        with open(f) as fh:
            raw = json.load(fh)
        meta = raw.get("meta", {})
        candles = raw.get("candles", [])
        if len(candles) < MIN_CANDLES:
            print(f"Skipping {f.name}: only {len(candles)} candles (need {MIN_CANDLES})")
            continue
        all_tokens.append({
            "meta": meta,
            "candles": candles,
            "file": f.name,
        })
    if not all_tokens:
        raise ValueError(f"No token files with >= {MIN_CANDLES} candles found.")
    print(f"Loaded {len(all_tokens)} token(s) from {DATA_DIR}")
    return all_tokens


# ── Feature Engineering ──────────────────────────────────────────────────────

def _safe_log(x):
    return math.log(max(x, 1e-15))

def engineer_features(candles):
    """
    Per-candle features from OHLCV data.
    Returns numpy array of shape (num_candles, num_features).

    Features per candle:
      0: log_return        = ln(close / prev_close)
      1: high_low_range    = (high - low) / close
      2: open_close_body   = (close - open) / close
      3: upper_wick        = (high - max(open,close)) / close
      4: lower_wick        = (min(open,close) - low) / close
      5: log_volume        = ln(volume + 1)
      6: volume_change     = (volume - prev_volume) / (prev_volume + 1)
      7: close_sma5_ratio  = close / SMA(close, 5) - 1
      8: close_sma12_ratio = close / SMA(close, 12) - 1
      9: volatility_5      = std(log_returns, 5)
    """
    n = len(candles)
    feats = np.zeros((n, 10), dtype=np.float32)

    closes = [c["close"] for c in candles]
    volumes = [c["volume"] for c in candles]

    for i in range(n):
        c = candles[i]
        o, h, l, cl, v = c["open"], c["high"], c["low"], c["close"], c["volume"]
        cl = max(cl, 1e-15)

        # log return
        if i > 0:
            prev_cl = max(candles[i-1]["close"], 1e-15)
            feats[i, 0] = _safe_log(cl) - _safe_log(prev_cl)
        # range
        feats[i, 1] = (h - l) / cl
        # body
        feats[i, 2] = (cl - o) / cl
        # wicks
        feats[i, 3] = (h - max(o, cl)) / cl
        feats[i, 4] = (min(o, cl) - l) / cl
        # volume
        feats[i, 5] = math.log(v + 1)
        if i > 0:
            prev_v = volumes[i-1]
            feats[i, 6] = (v - prev_v) / (prev_v + 1)
        # SMA ratios
        if i >= 4:
            sma5 = sum(closes[i-4:i+1]) / 5
            feats[i, 7] = cl / max(sma5, 1e-15) - 1
        if i >= 11:
            sma12 = sum(closes[i-11:i+1]) / 12
            feats[i, 8] = cl / max(sma12, 1e-15) - 1
        # rolling volatility
        if i >= 4:
            log_rets = [feats[j, 0] for j in range(i-4, i+1)]
            mean_lr = sum(log_rets) / 5
            var_lr = sum((lr - mean_lr)**2 for lr in log_rets) / 5
            feats[i, 9] = math.sqrt(var_lr)

    return feats

NUM_FEATURES = 10


# ── Dataset Construction ─────────────────────────────────────────────────────

def build_windows(feats, candles, window_size=WINDOW_SIZE, horizon=FORECAST_HORIZON):
    """
    Build sliding windows of features and target returns.
    X: (num_windows, window_size, num_features)
    y: (num_windows,) — future log return (target for long prediction)
    """
    n = feats.shape[0]
    X_list, y_list = [], []
    for i in range(window_size, n - horizon):
        window = feats[i - window_size : i]
        # target: log return over the forecast horizon
        future_close = max(candles[i + horizon - 1]["close"], 1e-15)
        current_close = max(candles[i - 1]["close"], 1e-15)
        target_return = _safe_log(future_close) - _safe_log(current_close)
        X_list.append(window)
        y_list.append(target_return)
    return np.array(X_list, dtype=np.float32), np.array(y_list, dtype=np.float32)


def prepare_data(window_size=WINDOW_SIZE, horizon=FORECAST_HORIZON):
    """
    Full data pipeline: load → features → windows → train/val split.
    Returns dict with MLX arrays.
    """
    tokens = load_candle_files()

    all_X, all_y = [], []
    for tok in tokens:
        feats = engineer_features(tok["candles"])
        X, y = build_windows(feats, tok["candles"], window_size, horizon)
        if len(X) > 0:
            all_X.append(X)
            all_y.append(y)
            print(f"  {tok['file']}: {len(X)} windows")

    X = np.concatenate(all_X, axis=0)
    y = np.concatenate(all_y, axis=0)

    # Normalize features (z-score per feature across training set)
    n_total = len(X)
    n_val = max(1, int(n_total * VAL_FRACTION))
    n_train = n_total - n_val

    X_train_np, X_val_np = X[:n_train], X[n_train:]
    y_train_np, y_val_np = y[:n_train], y[n_train:]

    # Compute normalization stats from training set only
    flat_train = X_train_np.reshape(-1, X_train_np.shape[-1])
    feat_mean = flat_train.mean(axis=0)
    feat_std = flat_train.std(axis=0) + 1e-8

    X_train_np = (X_train_np - feat_mean) / feat_std
    X_val_np = (X_val_np - feat_mean) / feat_std

    # Normalize targets too
    y_mean = y_train_np.mean()
    y_std = y_train_np.std() + 1e-8

    print(f"\nDataset: {n_train} train, {n_val} val windows")
    print(f"Features: {NUM_FEATURES}, Window: {window_size}, Horizon: {horizon}")
    print(f"Target return stats — mean: {y_mean:.6f}, std: {y_std:.6f}")

    return {
        "X_train": mx.array(X_train_np),
        "y_train": mx.array(y_train_np),
        "X_val": mx.array(X_val_np),
        "y_val": mx.array(y_val_np),
        "feat_mean": feat_mean,
        "feat_std": feat_std,
        "y_mean": float(y_mean),
        "y_std": float(y_std),
        "n_train": n_train,
        "n_val": n_val,
    }


# ── Trading Simulation ──────────────────────────────────────────────────────

def simulate_trading(predictions, actual_returns, threshold=0.0):
    """
    Simple long-only trading simulation.
    Goes long when predicted return > threshold, flat otherwise.
    Returns dict of performance metrics.
    """
    if isinstance(predictions, mx.array):
        predictions = np.array(predictions)
    if isinstance(actual_returns, mx.array):
        actual_returns = np.array(actual_returns)

    n = len(predictions)
    if n == 0:
        return {"sharpe": 0.0, "total_return": 0.0, "win_rate": 0.0, "n_trades": 0}

    # Position: 1 if prediction > threshold, else 0
    positions = (predictions > threshold).astype(np.float32)
    trade_returns = positions * actual_returns

    n_trades = int(positions.sum())
    if n_trades == 0:
        return {"sharpe": 0.0, "total_return": 0.0, "win_rate": 0.0, "n_trades": 0}

    total_return = float(trade_returns.sum())
    mean_ret = trade_returns[positions > 0].mean() if n_trades > 0 else 0.0
    std_ret = trade_returns[positions > 0].std() if n_trades > 1 else 1.0

    sharpe = float(mean_ret / (std_ret + 1e-8)) * math.sqrt(24 * 365)  # annualized hourly
    win_rate = float((trade_returns[positions > 0] > 0).mean()) if n_trades > 0 else 0.0

    # Max drawdown
    cum_returns = np.cumsum(trade_returns)
    peak = np.maximum.accumulate(cum_returns)
    drawdown = peak - cum_returns
    max_drawdown = float(drawdown.max()) if len(drawdown) > 0 else 0.0

    return {
        "sharpe": round(sharpe, 4),
        "total_return": round(total_return, 6),
        "win_rate": round(win_rate, 4),
        "n_trades": n_trades,
        "max_drawdown": round(max_drawdown, 6),
        "mean_return_per_trade": round(float(mean_ret), 8),
    }


if __name__ == "__main__":
    data = prepare_data()
    print("\nData preparation complete.")
    print(f"X_train shape: {data['X_train'].shape}")
    print(f"y_train shape: {data['y_train'].shape}")
