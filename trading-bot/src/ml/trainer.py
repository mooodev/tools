"""
LightGBM Trainer for Pump.fun Token Pattern Detection

Core philosophy:
  - Train on rolling windows to capture current regime.
  - Binary classification: "Does token go up X% in next Y candles?"

Usage:
  python trainer.py train --data <csv_path> --config <json_config>
  python trainer.py predict --data <csv_path> --model <model_path>
"""

import sys
import json
import os
import platform
import warnings
import numpy as np
import pandas as pd

# Suppress sklearn warnings about single-class ROC AUC
warnings.filterwarnings("ignore", category=UserWarning, module="sklearn")
try:
    from sklearn.exceptions import UndefinedMetricWarning
    warnings.filterwarnings("ignore", category=UndefinedMetricWarning)
except ImportError:
    pass

try:
    import lightgbm as lgb
except OSError as e:
    if "libomp" in str(e) and platform.system() == "Darwin":
        print(json.dumps({
            "error": "LightGBM requires OpenMP (libomp) on macOS. "
                     "Fix: run 'brew install libomp' then retry.",
            "fix_command": "brew install libomp",
        }))
        sys.exit(1)
    raise

from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, classification_report, confusion_matrix
)
from pathlib import Path


def load_data(csv_path):
    """Load training data CSV exported by Node.js feature engineer."""
    df = pd.read_csv(csv_path)
    feature_cols = [c for c in df.columns if c not in ("label", "timestamp", "token_id")]
    X = df[feature_cols].values
    y = df["label"].values
    timestamps = df["timestamp"].values if "timestamp" in df.columns else None
    token_ids = df["token_id"].values if "token_id" in df.columns else None
    return X, y, feature_cols, timestamps, token_ids


def train(csv_path, config_json, output_dir):
    """
    Train LightGBM with walk-forward validation.
    Returns metrics + feature importance + pattern decay analysis.
    """
    X, y, feature_names, timestamps, token_ids = load_data(csv_path)

    n = len(X)
    if n < 100:
        return {"error": f"Not enough data: {n} samples"}

    # Parse config
    cfg = json.loads(config_json) if isinstance(config_json, str) else config_json

    # Auto-compute scale_pos_weight for class imbalance
    pos_count = int(np.sum(y == 1))
    neg_count = int(np.sum(y == 0))
    positive_rate = pos_count / max(pos_count + neg_count, 1)
    scale_pos_weight = neg_count / max(pos_count, 1)

    warnings = []
    if pos_count < 10:
        warnings.append(f"Very few positive samples ({pos_count}). Lower GROWTH_THRESHOLD or increase PREDICTION_HORIZON.")
    if positive_rate < 0.01:
        warnings.append(f"Extreme class imbalance: only {positive_rate*100:.2f}% positive. Model will likely predict all negatives. Lower GROWTH_THRESHOLD or increase PREDICTION_HORIZON.")
    elif positive_rate < 0.05:
        warnings.append(f"Low positive rate ({positive_rate*100:.1f}%). Target 5-15% for best results. Consider lowering GROWTH_THRESHOLD or increasing PREDICTION_HORIZON.")

    params = {
        "objective": "binary",
        "metric": ["binary_logloss", "auc"],
        "boosting_type": "gbdt",
        "num_leaves": cfg.get("LGBM_NUM_LEAVES", 31),
        "max_depth": cfg.get("LGBM_MAX_DEPTH", -1),
        "learning_rate": cfg.get("LGBM_LEARNING_RATE", 0.05),
        "n_estimators": cfg.get("LGBM_N_ESTIMATORS", 500),
        "min_child_samples": cfg.get("LGBM_MIN_CHILD_SAMPLES", 20),
        "subsample": cfg.get("LGBM_SUBSAMPLE", 0.8),
        "colsample_bytree": cfg.get("LGBM_COLSAMPLE_BYTREE", 0.8),
        "reg_alpha": cfg.get("LGBM_REG_ALPHA", 0.1),
        "reg_lambda": cfg.get("LGBM_REG_LAMBDA", 0.1),
        "scale_pos_weight": scale_pos_weight,
        "verbose": -1,
        "seed": 42,
    }
    early_stopping = cfg.get("LGBM_EARLY_STOPPING_ROUNDS", 50)

    # Walk-forward split (chronological — no future leakage)
    train_ratio = cfg.get("TRAIN_RATIO", 0.70)
    val_ratio = cfg.get("VAL_RATIO", 0.15)

    train_end = int(n * train_ratio)
    val_end = int(n * (train_ratio + val_ratio))

    X_train, y_train = X[:train_end], y[:train_end]
    X_val, y_val = X[train_end:val_end], y[train_end:val_end]
    X_test, y_test = X[val_end:], y[val_end:]

    # Create datasets
    train_data = lgb.Dataset(X_train, label=y_train, feature_name=feature_names)
    val_data = lgb.Dataset(X_val, label=y_val, feature_name=feature_names, reference=train_data)

    # Train
    callbacks = [
        lgb.early_stopping(early_stopping),
        lgb.log_evaluation(50),
    ]

    model = lgb.train(
        params,
        train_data,
        num_boost_round=params["n_estimators"],
        valid_sets=[train_data, val_data],
        valid_names=["train", "val"],
        callbacks=callbacks,
    )

    # Evaluate on test set
    y_pred_proba = model.predict(X_test)
    y_pred = (y_pred_proba >= 0.5).astype(int)

    test_classes = len(np.unique(y_test))
    test_pos = int(np.sum(y_test == 1))
    test_neg = int(np.sum(y_test == 0))

    if test_classes < 2:
        warnings.append(f"Test set has only one class ({test_pos} positive, {test_neg} negative). Metrics are unreliable.")

    # Build confusion matrix ensuring 2x2 shape
    cm = confusion_matrix(y_test, y_pred, labels=[0, 1])

    metrics = {
        "accuracy": float(accuracy_score(y_test, y_pred)),
        "precision": float(precision_score(y_test, y_pred, zero_division=0)),
        "recall": float(recall_score(y_test, y_pred, zero_division=0)),
        "f1": float(f1_score(y_test, y_pred, zero_division=0)),
        "auc": float(roc_auc_score(y_test, y_pred_proba)) if test_classes > 1 else 0.0,
        "samples": {"train": len(y_train), "val": len(y_val), "test": len(y_test)},
        "class_balance": {"positive": pos_count, "negative": neg_count},
        "test_balance": {"positive": test_pos, "negative": test_neg},
        "best_iteration": model.best_iteration,
        "confusion_matrix": cm.tolist(),
        "positive_rate": round(positive_rate * 100, 2),
    }

    # Feature importance (gain-based — what features ACTUALLY drive splits)
    importance = model.feature_importance(importance_type="gain")
    importance_norm = importance / (importance.sum() + 1e-10)
    feature_importance = sorted(
        [{"name": feature_names[i], "importance": float(importance_norm[i]),
          "raw": float(importance[i])}
         for i in range(len(feature_names))],
        key=lambda x: -x["importance"]
    )

    # Save model
    os.makedirs(output_dir, exist_ok=True)
    model_path = os.path.join(output_dir, "model.lgbm")
    model.save_model(model_path)

    # Save metrics & importance
    result = {
        "metrics": metrics,
        "feature_importance": feature_importance,
        "model_path": model_path,
        "params": {k: v for k, v in params.items() if k != "verbose"},
        "warnings": warnings,
    }

    with open(os.path.join(output_dir, "train_result.json"), "w") as f:
        json.dump(result, f, indent=2)

    return result


def predict(csv_path, model_path):
    """Run predictions on new data."""
    X, y, feature_names, timestamps, _ = load_data(csv_path)
    model = lgb.Booster(model_file=model_path)
    proba = model.predict(X)
    predictions = (proba >= 0.5).astype(int)

    results = []
    for i in range(len(X)):
        results.append({
            "timestamp": int(timestamps[i]) if timestamps is not None else i,
            "probability": float(proba[i]),
            "prediction": int(predictions[i]),
            "actual": int(y[i]) if y is not None else None,
        })

    return {"predictions": results, "total": len(results)}


def screen(csv_path, model_path, threshold=0.5, top_n=20):
    """
    Screen tokens: predict on latest data per token and rank by probability.
    Returns ranked list of tokens with BUY/HOLD/AVOID signals.
    """
    df = pd.read_csv(csv_path)
    feature_cols = [c for c in df.columns if c not in ("label", "timestamp", "token_id")]
    model = lgb.Booster(model_file=model_path)

    if "token_id" not in df.columns:
        return {"error": "CSV must have token_id column for screening"}

    # For each token, take its LATEST row (most recent candle features)
    token_signals = []
    for token_id, group in df.groupby("token_id"):
        latest = group.sort_values("timestamp").iloc[-1:]
        X_latest = latest[feature_cols].values
        prob = float(model.predict(X_latest)[0])

        # Also compute average probability over last N candles for confidence
        recent = group.sort_values("timestamp").tail(4)  # last ~1 hour
        X_recent = recent[feature_cols].values
        recent_probs = model.predict(X_recent)
        avg_prob = float(np.mean(recent_probs))
        consistency = float(np.std(recent_probs))  # lower = more consistent signal

        if prob >= threshold and avg_prob >= threshold * 0.8:
            signal = "BUY"
        elif prob < 0.3 and avg_prob < 0.35:
            signal = "AVOID"
        else:
            signal = "HOLD"

        token_signals.append({
            "token_id": str(token_id),
            "probability": prob,
            "avg_probability": avg_prob,
            "consistency": consistency,
            "signal": signal,
            "candles_available": len(group),
            "timestamp": int(latest["timestamp"].values[0]),
        })

    # Sort by probability descending (strongest buy signals first)
    token_signals.sort(key=lambda x: -x["probability"])

    buy_signals = [t for t in token_signals if t["signal"] == "BUY"]
    avoid_signals = [t for t in token_signals if t["signal"] == "AVOID"]
    hold_signals = [t for t in token_signals if t["signal"] == "HOLD"]

    return {
        "screened": len(token_signals),
        "top_tokens": token_signals[:top_n],
        "summary": {
            "buy": len(buy_signals),
            "hold": len(hold_signals),
            "avoid": len(avoid_signals),
        },
        "buy_signals": buy_signals[:top_n],
        "avoid_signals": avoid_signals[:10],
    }


# ─── CLI Entry Point ──────────────────────────────────────────────────

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python trainer.py <train|predict|screen> [args]")
        sys.exit(1)

    command = sys.argv[1]

    if command == "train":
        csv_path = sys.argv[2] if len(sys.argv) > 2 else None
        config_json = sys.argv[3] if len(sys.argv) > 3 else "{}"
        output_dir = sys.argv[4] if len(sys.argv) > 4 else "./models"

        if not csv_path:
            print(json.dumps({"error": "No CSV path provided"}))
            sys.exit(1)

        result = train(csv_path, config_json, output_dir)
        print(json.dumps(result, indent=2))

    elif command == "predict":
        csv_path = sys.argv[2] if len(sys.argv) > 2 else None
        model_path = sys.argv[3] if len(sys.argv) > 3 else None

        if not csv_path or not model_path:
            print(json.dumps({"error": "Need csv_path and model_path"}))
            sys.exit(1)

        result = predict(csv_path, model_path)
        print(json.dumps(result, indent=2))

    elif command == "screen":
        csv_path = sys.argv[2] if len(sys.argv) > 2 else None
        model_path = sys.argv[3] if len(sys.argv) > 3 else None
        threshold = float(sys.argv[4]) if len(sys.argv) > 4 else 0.5
        top_n = int(sys.argv[5]) if len(sys.argv) > 5 else 20

        if not csv_path or not model_path:
            print(json.dumps({"error": "Need csv_path and model_path"}))
            sys.exit(1)

        result = screen(csv_path, model_path, threshold, top_n)
        print(json.dumps(result, indent=2))

    else:
        print(json.dumps({"error": f"Unknown command: {command}"}))
        sys.exit(1)
