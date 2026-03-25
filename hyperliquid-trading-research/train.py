"""
Autoresearch training script for Hyperliquid altcoin trading.
This file IS the mutable experiment target — the autoresearch agent modifies
this file to explore models, hyperparameters, and trading strategies.

Uses multi-timeframe data (15m + 1h + 4h) with BTC as market leader.
Includes realistic 0.05% per-side trading fees.

Run: python train.py
"""

import time
import json
import math
import numpy as np
from pathlib import Path

from prepare import (
    prepare_data, simulate_trading, NUM_FEATURES, FEATURE_NAMES,
    FEE_PER_SIDE, ROUND_TRIP_FEE,
)

METRICS_FILE = Path(__file__).parent / "metrics.jsonl"

# ── Hyperparameters (MUTABLE — autoresearch tunes these) ─────────────────────

WINDOW_SIZE = 24          # lookback window in 1h candles
FORECAST_HORIZON = 4      # predict N candles ahead (4h forward)
TIME_BUDGET = 300         # 5 minutes max per experiment

# Model hyperparameters (LightGBM)
N_ESTIMATORS = 500
MAX_DEPTH = 6
LEARNING_RATE = 0.05
MIN_CHILD_SAMPLES = 20
NUM_LEAVES = 31
SUBSAMPLE = 0.8
COLSAMPLE_BYTREE = 0.8
REG_ALPHA = 0.1
REG_LAMBDA = 1.0

# Trading parameters
TRADE_THRESHOLD = 0.001   # min predicted return to enter (should cover fees)
USE_DYNAMIC_THRESHOLD = True  # threshold adapts based on prediction distribution

# Feature flattening: how to aggregate the window
# Options: "flatten", "last_n", "statistics"
FEATURE_MODE = "statistics"
LAST_N = 6  # only used when FEATURE_MODE = "last_n"


# ── Metrics Logging ─────────────────────────────────────────────────────────

def log_metrics(data):
    """Append a JSON line to metrics.jsonl for tracking."""
    with open(METRICS_FILE, "a") as f:
        f.write(json.dumps(data) + "\n")


# ── Feature Processing ──────────────────────────────────────────────────────

def flatten_windows(X):
    """Convert 3D windows to 2D feature matrix for tree-based models."""
    n_samples, window_size, n_features = X.shape

    if FEATURE_MODE == "flatten":
        # Full flatten: every timestep × feature becomes a column
        return X.reshape(n_samples, -1)

    elif FEATURE_MODE == "last_n":
        # Use only the last N candles (reduces noise from old data)
        last_n = min(LAST_N, window_size)
        return X[:, -last_n:, :].reshape(n_samples, -1)

    elif FEATURE_MODE == "statistics":
        # Statistical summary of the window + recent values
        features_list = []

        # 1. Last candle features (most recent)
        features_list.append(X[:, -1, :])

        # 2. Mean of full window
        features_list.append(X.mean(axis=1))

        # 3. Std of full window (volatility/dispersion)
        features_list.append(X.std(axis=1))

        # 4. Min and Max (extremes)
        features_list.append(X.min(axis=1))
        features_list.append(X.max(axis=1))

        # 5. Change: last - first (trend over window)
        features_list.append(X[:, -1, :] - X[:, 0, :])

        # 6. Recent momentum: last 3 candles mean - first 3 candles mean
        recent = X[:, -3:, :].mean(axis=1)
        early = X[:, :3, :].mean(axis=1)
        features_list.append(recent - early)

        # 7. Slope: linear regression coefficient approximation
        t = np.arange(window_size, dtype=np.float32)
        t_mean = t.mean()
        t_var = ((t - t_mean) ** 2).sum()
        if t_var > 1e-15:
            # (N, W, F) × (W,) -> slope per feature
            X_centered = X - X.mean(axis=1, keepdims=True)
            t_centered = t - t_mean
            slopes = np.einsum('nwf,w->nf', X_centered, t_centered) / t_var
            features_list.append(slopes)

        return np.concatenate(features_list, axis=1)

    else:
        raise ValueError(f"Unknown FEATURE_MODE: {FEATURE_MODE}")


# ── Model Training ──────────────────────────────────────────────────────────

def train_model(X_train_2d, y_train):
    """Train a LightGBM model. Falls back to sklearn if lightgbm unavailable."""
    try:
        import lightgbm as lgb

        model = lgb.LGBMRegressor(
            n_estimators=N_ESTIMATORS,
            max_depth=MAX_DEPTH,
            learning_rate=LEARNING_RATE,
            min_child_samples=MIN_CHILD_SAMPLES,
            num_leaves=NUM_LEAVES,
            subsample=SUBSAMPLE,
            colsample_bytree=COLSAMPLE_BYTREE,
            reg_alpha=REG_ALPHA,
            reg_lambda=REG_LAMBDA,
            random_state=42,
            n_jobs=-1,
            verbose=-1,
        )
        model.fit(X_train_2d, y_train)
        return model, "lightgbm"

    except ImportError:
        from sklearn.ensemble import GradientBoostingRegressor

        print("  LightGBM not available, using sklearn GradientBoosting...")
        model = GradientBoostingRegressor(
            n_estimators=min(N_ESTIMATORS, 200),
            max_depth=min(MAX_DEPTH, 5),
            learning_rate=LEARNING_RATE,
            subsample=SUBSAMPLE,
            random_state=42,
        )
        model.fit(X_train_2d, y_train)
        return model, "sklearn_gbr"


def get_feature_importance(model, model_type, n_features):
    """Get feature importance from the trained model."""
    if model_type == "lightgbm":
        return model.feature_importances_
    elif model_type == "sklearn_gbr":
        return model.feature_importances_
    return np.zeros(n_features)


# ── Trading Logic ───────────────────────────────────────────────────────────

def compute_threshold(predictions, base_threshold=TRADE_THRESHOLD):
    """
    Compute adaptive trading threshold.
    Only trade when predicted return is significantly positive.
    """
    if not USE_DYNAMIC_THRESHOLD:
        return base_threshold

    # Adaptive: threshold is max of base_threshold and
    # the point where expected profit > fees
    pred_std = predictions.std()
    if pred_std > 1e-8:
        # Only trade top predictions that exceed fee cost
        adaptive = max(base_threshold, ROUND_TRIP_FEE * 1.5)
        return adaptive

    return base_threshold


# ── Multi-Timeframe Experiment ──────────────────────────────────────────────

def run_timeframe_experiment(window_size, horizon, label):
    """Run a single experiment with given timeframe parameters."""
    print(f"\n{'─'*50}")
    print(f"  Experiment: {label}")
    print(f"  Window={window_size}h, Horizon={horizon}h")
    print(f"  Fee per side: {FEE_PER_SIDE*100:.2f}%, Round trip: {ROUND_TRIP_FEE*100:.2f}%")
    print(f"{'─'*50}")

    data = prepare_data(window_size=window_size, horizon=horizon)
    X_train, y_train = data["X_train"], data["y_train"]
    X_val, y_val = data["X_val"], data["y_val"]

    # Flatten windows to 2D for tree model
    print(f"\nFlattening windows (mode={FEATURE_MODE})...")
    X_train_2d = flatten_windows(X_train)
    X_val_2d = flatten_windows(X_val)
    print(f"  Feature matrix: {X_train_2d.shape[1]} columns from "
          f"{X_train.shape[1]}×{X_train.shape[2]} windows")

    # Train
    print(f"\nTraining model (n_estimators={N_ESTIMATORS}, "
          f"max_depth={MAX_DEPTH}, lr={LEARNING_RATE})...")
    t0 = time.time()
    model, model_type = train_model(X_train_2d, y_train)
    train_time = time.time() - t0
    print(f"  Trained {model_type} in {train_time:.1f}s")

    # Predict
    train_preds = model.predict(X_train_2d)
    val_preds = model.predict(X_val_2d)

    # Compute threshold
    threshold = compute_threshold(val_preds)
    print(f"  Trading threshold: {threshold:.6f}")

    # Simulate trading
    train_metrics = simulate_trading(train_preds, y_train, threshold=threshold)
    val_metrics = simulate_trading(val_preds, y_val, threshold=threshold)

    # Feature importance (top 15)
    importance = get_feature_importance(model, model_type, X_train_2d.shape[1])
    if len(importance) > 0:
        top_idx = np.argsort(importance)[::-1][:15]
        print(f"\n  Top 15 features by importance:")
        for rank, idx in enumerate(top_idx):
            print(f"    {rank+1:2d}. col_{idx}: importance={importance[idx]:.4f}")

    return {
        "label": label,
        "window_size": window_size,
        "horizon": horizon,
        "train_metrics": train_metrics,
        "val_metrics": val_metrics,
        "threshold": threshold,
        "model_type": model_type,
        "train_time": train_time,
        "n_features_2d": X_train_2d.shape[1],
    }


# ── Main Training Entry Point ───────────────────────────────────────────────

def train():
    print("=" * 60)
    print("HYPERLIQUID ALT TRADING RESEARCH")
    print("Multi-Timeframe + BTC Leader Analysis")
    print("=" * 60)

    METRICS_FILE.write_text("")
    start_time = time.time()

    # ── Run experiments across different timeframes ──
    experiments = [
        # (window_size, horizon, label)
        (WINDOW_SIZE, 1, "short_1h"),      # Short-term: 1h ahead
        (WINDOW_SIZE, 4, "medium_4h"),     # Medium-term: 4h ahead
        (WINDOW_SIZE, 12, "swing_12h"),    # Swing: 12h ahead
        (WINDOW_SIZE, 24, "daily_24h"),    # Daily: 24h ahead
        (12, 4, "fast_w12_h4"),            # Shorter lookback
        (48, 4, "long_w48_h4"),            # Longer lookback
    ]

    results = []
    best_sharpe = -float("inf")
    best_experiment = None

    for window_size, horizon, label in experiments:
        elapsed = time.time() - start_time
        if elapsed >= TIME_BUDGET:
            print(f"\nTime budget exhausted ({TIME_BUDGET}s)")
            break

        try:
            result = run_timeframe_experiment(window_size, horizon, label)
            results.append(result)

            vm = result["val_metrics"]
            print(f"\n  Results ({label}):")
            print(f"    Train — sharpe={result['train_metrics']['sharpe']:+.4f} "
                  f"return={result['train_metrics']['total_return']:+.6f} "
                  f"win={result['train_metrics']['win_rate']:.2%} "
                  f"trades={result['train_metrics']['n_trades']} "
                  f"fees={result['train_metrics']['total_fees_paid']:.6f}")
            print(f"    Val   — sharpe={vm['sharpe']:+.4f} "
                  f"return={vm['total_return']:+.6f} "
                  f"win={vm['win_rate']:.2%} "
                  f"trades={vm['n_trades']} "
                  f"fees={vm['total_fees_paid']:.6f} "
                  f"PF={vm['profit_factor']:.2f}")

            if vm["sharpe"] > best_sharpe:
                best_sharpe = vm["sharpe"]
                best_experiment = result

            log_metrics({
                "label": label,
                "window_size": window_size,
                "horizon": horizon,
                "val_sharpe": vm["sharpe"],
                "val_return": vm["total_return"],
                "val_win_rate": vm["win_rate"],
                "val_n_trades": vm["n_trades"],
                "val_max_drawdown": vm["max_drawdown"],
                "val_profit_factor": vm["profit_factor"],
                "val_fees_paid": vm["total_fees_paid"],
                "threshold": result["threshold"],
                "train_time": result["train_time"],
                "elapsed": round(time.time() - start_time, 1),
            })

        except Exception as e:
            print(f"\n  FAILED ({label}): {e}")
            log_metrics({"label": label, "error": str(e)})
            continue

    # ── Summary ──
    total_time = time.time() - start_time

    print("\n" + "=" * 60)
    print("EXPERIMENT SUMMARY")
    print("=" * 60)

    print(f"\n{'Label':<20} {'Sharpe':>8} {'Return':>10} {'Win%':>8} "
          f"{'Trades':>7} {'PF':>6} {'Fees':>10} {'MDD':>10}")
    print("-" * 85)

    for r in results:
        vm = r["val_metrics"]
        print(f"{r['label']:<20} {vm['sharpe']:>+8.4f} {vm['total_return']:>+10.6f} "
              f"{vm['win_rate']:>7.2%} {vm['n_trades']:>7d} "
              f"{vm['profit_factor']:>6.2f} {vm['total_fees_paid']:>10.6f} "
              f"{vm['max_drawdown']:>10.6f}")

    if best_experiment:
        bm = best_experiment["val_metrics"]
        print(f"\nBest: {best_experiment['label']} "
              f"(window={best_experiment['window_size']}, "
              f"horizon={best_experiment['horizon']})")
        print(f"  Sharpe={bm['sharpe']:+.4f}, Return={bm['total_return']:+.6f}, "
              f"Win={bm['win_rate']:.2%}, PF={bm['profit_factor']:.2f}")
        print(f"  Trades={bm['n_trades']}, Fees={bm['total_fees_paid']:.6f}, "
              f"MDD={bm['max_drawdown']:.6f}")

    print(f"\nTotal time: {total_time:.1f}s")
    print(f"Fee model: {FEE_PER_SIDE*100:.2f}% per side "
          f"({ROUND_TRIP_FEE*100:.2f}% round trip)")

    # Log final summary
    log_metrics({
        "final": True,
        "best_label": best_experiment["label"] if best_experiment else "none",
        "best_val_sharpe": best_sharpe,
        "best_val_return": best_experiment["val_metrics"]["total_return"] if best_experiment else 0,
        "best_val_win_rate": best_experiment["val_metrics"]["win_rate"] if best_experiment else 0,
        "best_profit_factor": best_experiment["val_metrics"]["profit_factor"] if best_experiment else 0,
        "total_time": round(total_time, 1),
        "n_experiments": len(results),
        "feature_mode": FEATURE_MODE,
        "model_config": {
            "n_estimators": N_ESTIMATORS,
            "max_depth": MAX_DEPTH,
            "learning_rate": LEARNING_RATE,
        },
    })

    # ── Primary metric output for autoresearch ──
    print(f"\n>>> val_sharpe {best_sharpe:.4f}")

    return best_experiment["val_metrics"] if best_experiment else {}


if __name__ == "__main__":
    train()
