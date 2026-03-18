"""
LightGBM Trainer for Pump.fun Token Pattern Detection

Core philosophy (Fama EMH + Simons):
  - Markets adapt. Patterns decay. Fresh edges are short-lived.
  - Train on rolling windows to capture current regime.
  - Track feature importance drift to detect "traded-out" patterns.
  - Binary classification: "Does token go up X% in next Y candles?"

Usage:
  python trainer.py train --data <csv_path> --config <json_config>
  python trainer.py predict --data <csv_path> --model <model_path>
  python trainer.py decay --data <csv_path> --config <json_config>
"""

import sys
import json
import os
import numpy as np
import pandas as pd
import lightgbm as lgb
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
    pos_count = np.sum(y == 1)
    neg_count = np.sum(y == 0)
    scale_pos_weight = neg_count / max(pos_count, 1)

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

    metrics = {
        "accuracy": float(accuracy_score(y_test, y_pred)),
        "precision": float(precision_score(y_test, y_pred, zero_division=0)),
        "recall": float(recall_score(y_test, y_pred, zero_division=0)),
        "f1": float(f1_score(y_test, y_pred, zero_division=0)),
        "auc": float(roc_auc_score(y_test, y_pred_proba)) if len(np.unique(y_test)) > 1 else 0.0,
        "samples": {"train": len(y_train), "val": len(y_val), "test": len(y_test)},
        "class_balance": {"positive": int(pos_count), "negative": int(neg_count)},
        "best_iteration": model.best_iteration,
        "confusion_matrix": confusion_matrix(y_test, y_pred).tolist(),
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


def analyze_pattern_decay(csv_path, config_json, output_dir):
    """
    EMH Pattern Decay Analysis (the core innovation).

    Trains models on rolling time windows and tracks how feature importance
    changes over time. Features whose importance is declining are "traded out"
    — the market has adapted and those patterns no longer work.

    Returns:
      - Feature importance per window
      - Alpha decay rates per feature
      - "Freshness score" for each feature
      - Regime change detection
    """
    X, y, feature_names, timestamps, _ = load_data(csv_path)
    cfg = json.loads(config_json) if isinstance(config_json, str) else config_json

    n = len(X)
    window_candles = int(cfg.get("DECAY_WINDOW_HOURS", 12) * 60 / cfg.get("CANDLE_MINUTES", 15))
    min_window_samples = max(50, window_candles // 2)

    # Create rolling windows
    windows = []
    step = window_candles // 2  # 50% overlap
    for start in range(0, n - window_candles, step):
        end = start + window_candles
        if end > n:
            break
        windows.append((start, end))

    if len(windows) < cfg.get("DECAY_MIN_WINDOWS", 3):
        return {"error": f"Not enough windows: {len(windows)} (need {cfg.get('DECAY_MIN_WINDOWS', 3)})"}

    # Train a quick model on each window, extract feature importance
    window_importances = []
    window_metrics = []

    params = {
        "objective": "binary",
        "metric": "auc",
        "boosting_type": "gbdt",
        "num_leaves": 15,        # Smaller model for speed
        "max_depth": 5,
        "learning_rate": 0.1,
        "n_estimators": 100,
        "min_child_samples": 10,
        "subsample": 0.8,
        "colsample_bytree": 0.8,
        "verbose": -1,
        "seed": 42,
    }

    for wi, (start, end) in enumerate(windows):
        X_w = X[start:end]
        y_w = y[start:end]

        if len(np.unique(y_w)) < 2:
            continue

        # 80/20 split within window (chronological)
        split = int(len(X_w) * 0.8)
        X_tr, y_tr = X_w[:split], y_w[:split]
        X_te, y_te = X_w[split:], y_w[split:]

        if len(np.unique(y_tr)) < 2 or len(X_te) < 5:
            continue

        pos_count = np.sum(y_tr == 1)
        neg_count = np.sum(y_tr == 0)
        params["scale_pos_weight"] = neg_count / max(pos_count, 1)

        train_data = lgb.Dataset(X_tr, label=y_tr, feature_name=feature_names)
        val_data = lgb.Dataset(X_te, label=y_te, feature_name=feature_names, reference=train_data)

        model = lgb.train(
            params, train_data, num_boost_round=100,
            valid_sets=[val_data], valid_names=["val"],
            callbacks=[lgb.early_stopping(20), lgb.log_evaluation(0)],
        )

        # Feature importance
        imp = model.feature_importance(importance_type="gain")
        imp_norm = imp / (imp.sum() + 1e-10)

        # Window AUC
        y_pred = model.predict(X_te)
        try:
            auc = float(roc_auc_score(y_te, y_pred))
        except ValueError:
            auc = 0.5

        ts_start = int(timestamps[start]) if timestamps is not None else start
        ts_end = int(timestamps[min(end - 1, len(timestamps) - 1)]) if timestamps is not None else end

        window_importances.append({
            "window": wi,
            "start": ts_start,
            "end": ts_end,
            "importance": {feature_names[j]: float(imp_norm[j]) for j in range(len(feature_names))},
        })

        window_metrics.append({
            "window": wi,
            "start": ts_start,
            "end": ts_end,
            "auc": auc,
            "samples": len(X_w),
            "positive_rate": float(np.mean(y_w)),
        })

    if len(window_importances) < 2:
        return {"error": "Not enough valid windows for decay analysis"}

    # Compute alpha decay for each feature
    feature_decay = {}
    for fname in feature_names:
        importance_series = [w["importance"].get(fname, 0) for w in window_importances]

        if len(importance_series) < 2:
            feature_decay[fname] = {
                "current_importance": importance_series[-1] if importance_series else 0,
                "trend": 0, "decay_rate": 0, "freshness_score": 0.5, "status": "unknown",
            }
            continue

        # Linear trend of importance over windows
        x = np.arange(len(importance_series))
        if np.std(importance_series) > 0:
            slope = np.polyfit(x, importance_series, 1)[0]
        else:
            slope = 0

        current = importance_series[-1]
        peak = max(importance_series)
        mean_imp = np.mean(importance_series)

        # Decay rate: how much has importance dropped from peak?
        decay_rate = (peak - current) / (peak + 1e-10) if peak > 0 else 0

        # Freshness score (0=dead, 1=very fresh)
        # High if: rising trend + high current importance + recent peak
        peak_recency = 1 - (importance_series.index(peak) / len(importance_series)) if peak > 0 else 0
        trend_signal = min(1, max(-1, slope * len(importance_series) * 10))  # Normalize slope
        freshness = np.clip(
            0.4 * (1 - decay_rate) + 0.3 * (0.5 + trend_signal * 0.5) + 0.3 * peak_recency,
            0, 1
        )

        # Status classification
        threshold = cfg.get("ALPHA_DECAY_THRESHOLD", 0.3)
        if decay_rate > threshold and slope < 0:
            status = "traded_out"
        elif slope > 0 and current > mean_imp:
            status = "emerging"
        elif abs(slope) < 0.001 and current > 0.01:
            status = "stable"
        else:
            status = "weak"

        feature_decay[fname] = {
            "current_importance": float(current),
            "peak_importance": float(peak),
            "mean_importance": float(mean_imp),
            "trend": float(slope),
            "decay_rate": float(decay_rate),
            "freshness_score": float(freshness),
            "status": status,
            "importance_history": [float(v) for v in importance_series],
        }

    # Overall market regime detection (via model AUC trend)
    auc_series = [w["auc"] for w in window_metrics]
    if len(auc_series) >= 2:
        auc_slope = np.polyfit(np.arange(len(auc_series)), auc_series, 1)[0]
        if auc_slope > 0.01:
            regime = "patterns_emerging"
        elif auc_slope < -0.01:
            regime = "patterns_decaying"
        else:
            regime = "stable"
    else:
        regime = "unknown"
        auc_slope = 0

    # Rank features by freshness
    ranked = sorted(feature_decay.items(), key=lambda x: -x[1]["freshness_score"])

    result = {
        "regime": regime,
        "regime_trend": float(auc_slope),
        "windows_analyzed": len(window_importances),
        "window_metrics": window_metrics,
        "feature_decay": feature_decay,
        "freshest_features": [
            {"name": k, "freshness": v["freshness_score"], "status": v["status"]}
            for k, v in ranked[:15]
        ],
        "traded_out_features": [
            {"name": k, "decay_rate": v["decay_rate"], "freshness": v["freshness_score"]}
            for k, v in ranked if v["status"] == "traded_out"
        ],
        "emerging_features": [
            {"name": k, "trend": v["trend"], "freshness": v["freshness_score"]}
            for k, v in ranked if v["status"] == "emerging"
        ],
    }

    os.makedirs(output_dir, exist_ok=True)
    with open(os.path.join(output_dir, "decay_analysis.json"), "w") as f:
        json.dump(result, f, indent=2)

    return result


# ─── CLI Entry Point ──────────────────────────────────────────────────

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python trainer.py <train|predict|decay> [args]")
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

    elif command == "decay":
        csv_path = sys.argv[2] if len(sys.argv) > 2 else None
        config_json = sys.argv[3] if len(sys.argv) > 3 else "{}"
        output_dir = sys.argv[4] if len(sys.argv) > 4 else "./models"

        if not csv_path:
            print(json.dumps({"error": "No CSV path provided"}))
            sys.exit(1)

        result = analyze_pattern_decay(csv_path, config_json, output_dir)
        print(json.dumps(result, indent=2))

    else:
        print(json.dumps({"error": f"Unknown command: {command}"}))
        sys.exit(1)
