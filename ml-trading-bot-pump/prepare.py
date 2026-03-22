"""
Data preparation for pump.fun token candle trading.
Loads JSON candle files, engineers features with technical indicators,
creates train/val splits.
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


# ── Helper Functions ─────────────────────────────────────────────────────────

def _safe_log(x):
    return math.log(max(x, 1e-15))

def _sma(values, period, i):
    """Simple Moving Average ending at index i."""
    if i < period - 1:
        return None
    return sum(values[i - period + 1 : i + 1]) / period

def _ema(values, period, i, prev_ema=None):
    """Exponential Moving Average at index i."""
    k = 2.0 / (period + 1)
    if prev_ema is None:
        if i < period - 1:
            return None
        return sum(values[i - period + 1 : i + 1]) / period
    return values[i] * k + prev_ema * (1 - k)

def _rsi(gains, losses, period, i):
    """Relative Strength Index at index i."""
    if i < period:
        return 50.0  # neutral default
    avg_gain = sum(gains[i - period + 1 : i + 1]) / period
    avg_loss = sum(losses[i - period + 1 : i + 1]) / period
    if avg_loss < 1e-15:
        return 100.0
    rs = avg_gain / avg_loss
    return 100.0 - (100.0 / (1.0 + rs))


# ── Feature Engineering ──────────────────────────────────────────────────────

def engineer_features(candles):
    """
    Per-candle features from OHLCV data with full technical indicators.
    Returns numpy array of shape (num_candles, NUM_FEATURES).

    Features per candle (34 total):
      --- Raw OHLCV derived (0-9) ---
       0: log_return           = ln(close / prev_close)
       1: high_low_range       = (high - low) / close
       2: open_close_body      = (close - open) / close
       3: upper_wick           = (high - max(open,close)) / close
       4: lower_wick           = (min(open,close) - low) / close
       5: log_volume           = ln(volume + 1)
       6: volume_change        = (volume - prev_volume) / (prev_volume + 1)
       7: close_sma5_ratio     = close / SMA(close, 5) - 1
       8: close_sma12_ratio    = close / SMA(close, 12) - 1
       9: volatility_5         = std(log_returns, 5)

      --- Moving Averages (10-14) ---
      10: ema_9_ratio          = close / EMA(close, 9) - 1
      11: ema_21_ratio         = close / EMA(close, 21) - 1
      12: sma_20_ratio         = close / SMA(close, 20) - 1
      13: ema_9_21_cross       = EMA(9) / EMA(21) - 1  (trend direction)
      14: sma_5_20_cross       = SMA(5) / SMA(20) - 1  (golden/death cross)

      --- RSI (15-17) ---
      15: rsi_14               = RSI(14) normalized to [-1, 1]
      16: rsi_7                = RSI(7) normalized to [-1, 1]
      17: rsi_delta            = RSI(14) - RSI(14, prev)  (RSI momentum)

      --- MACD (18-20) ---
      18: macd_line            = (EMA12 - EMA26) / close
      19: macd_signal          = EMA9(MACD) / close
      20: macd_histogram       = (MACD - signal) / close

      --- Bollinger Bands (21-23) ---
      21: bb_upper_dist        = (upper_band - close) / close
      22: bb_lower_dist        = (close - lower_band) / close
      23: bb_width             = (upper - lower) / middle

      --- Volume Indicators (24-27) ---
      24: volume_sma5_ratio    = volume / SMA(volume, 5)
      25: volume_sma20_ratio   = volume / SMA(volume, 20)
      26: obv_change           = normalized OBV change
      27: vwap_ratio           = close / VWAP(20) - 1

      --- Momentum / Oscillators (28-33) ---
      28: roc_6                = Rate of Change(6)
      29: roc_12               = Rate of Change(12)
      30: stoch_k              = Stochastic %K(14) normalized [-1,1]
      31: stoch_d              = SMA(3) of %K normalized [-1,1]
      32: atr_14               = ATR(14) / close  (normalized)
      33: volatility_12        = std(log_returns, 12)
    """
    n = len(candles)
    num_feats = 34
    feats = np.zeros((n, num_feats), dtype=np.float32)

    closes = [c["close"] for c in candles]
    opens = [c["open"] for c in candles]
    highs = [c["high"] for c in candles]
    lows = [c["low"] for c in candles]
    volumes = [c["volume"] for c in candles]

    # Pre-compute log returns
    log_returns = [0.0] * n
    for i in range(1, n):
        log_returns[i] = _safe_log(closes[i]) - _safe_log(closes[i-1])

    # Pre-compute gains/losses for RSI
    gains = [0.0] * n
    losses = [0.0] * n
    for i in range(1, n):
        diff = closes[i] - closes[i-1]
        gains[i] = max(diff, 0)
        losses[i] = max(-diff, 0)

    # Pre-compute EMAs iteratively
    ema9 = [None] * n
    ema12 = [None] * n
    ema21 = [None] * n
    ema26 = [None] * n
    for i in range(n):
        ema9[i] = _ema(closes, 9, i, ema9[i-1] if i > 0 else None)
        ema12[i] = _ema(closes, 12, i, ema12[i-1] if i > 0 else None)
        ema21[i] = _ema(closes, 21, i, ema21[i-1] if i > 0 else None)
        ema26[i] = _ema(closes, 26, i, ema26[i-1] if i > 0 else None)

    # MACD line
    macd_line = [0.0] * n
    for i in range(n):
        if ema12[i] is not None and ema26[i] is not None:
            macd_line[i] = ema12[i] - ema26[i]

    # MACD signal (EMA9 of MACD line)
    macd_signal = [None] * n
    for i in range(n):
        macd_signal[i] = _ema(macd_line, 9, i, macd_signal[i-1] if i > 0 else None)

    # True Range for ATR
    tr = [0.0] * n
    for i in range(n):
        if i == 0:
            tr[i] = highs[i] - lows[i]
        else:
            tr[i] = max(
                highs[i] - lows[i],
                abs(highs[i] - closes[i-1]),
                abs(lows[i] - closes[i-1])
            )

    # OBV
    obv = [0.0] * n
    for i in range(1, n):
        if closes[i] > closes[i-1]:
            obv[i] = obv[i-1] + volumes[i]
        elif closes[i] < closes[i-1]:
            obv[i] = obv[i-1] - volumes[i]
        else:
            obv[i] = obv[i-1]

    # Stochastic %K values (pre-compute for smoothing to %D)
    stoch_k_raw = [50.0] * n

    for i in range(n):
        c = candles[i]
        o, h, l, cl, v = c["open"], c["high"], c["low"], c["close"], c["volume"]
        cl_safe = max(cl, 1e-15)

        # ── Raw OHLCV derived (0-9) ──
        feats[i, 0] = log_returns[i]
        feats[i, 1] = (h - l) / cl_safe
        feats[i, 2] = (cl - o) / cl_safe
        feats[i, 3] = (h - max(o, cl)) / cl_safe
        feats[i, 4] = (min(o, cl) - l) / cl_safe
        feats[i, 5] = math.log(v + 1)
        if i > 0:
            prev_v = volumes[i-1]
            feats[i, 6] = (v - prev_v) / (prev_v + 1)

        sma5 = _sma(closes, 5, i)
        if sma5 is not None:
            feats[i, 7] = cl / max(sma5, 1e-15) - 1
        sma12 = _sma(closes, 12, i)
        if sma12 is not None:
            feats[i, 8] = cl / max(sma12, 1e-15) - 1

        if i >= 4:
            lr_window = log_returns[i-4:i+1]
            mean_lr = sum(lr_window) / 5
            var_lr = sum((lr - mean_lr)**2 for lr in lr_window) / 5
            feats[i, 9] = math.sqrt(var_lr)

        # ── Moving Averages (10-14) ──
        if ema9[i] is not None:
            feats[i, 10] = cl / max(ema9[i], 1e-15) - 1
        if ema21[i] is not None:
            feats[i, 11] = cl / max(ema21[i], 1e-15) - 1

        sma20 = _sma(closes, 20, i)
        if sma20 is not None:
            feats[i, 12] = cl / max(sma20, 1e-15) - 1

        if ema9[i] is not None and ema21[i] is not None:
            feats[i, 13] = ema9[i] / max(ema21[i], 1e-15) - 1

        if sma5 is not None and sma20 is not None:
            feats[i, 14] = sma5 / max(sma20, 1e-15) - 1

        # ── RSI (15-17) ──
        rsi14 = _rsi(gains, losses, 14, i)
        rsi7 = _rsi(gains, losses, 7, i)
        feats[i, 15] = (rsi14 - 50.0) / 50.0  # normalize to [-1, 1]
        feats[i, 16] = (rsi7 - 50.0) / 50.0
        if i > 0:
            prev_rsi14 = _rsi(gains, losses, 14, i - 1)
            feats[i, 17] = (rsi14 - prev_rsi14) / 100.0

        # ── MACD (18-20) ──
        feats[i, 18] = macd_line[i] / cl_safe
        if macd_signal[i] is not None:
            feats[i, 19] = macd_signal[i] / cl_safe
            feats[i, 20] = (macd_line[i] - macd_signal[i]) / cl_safe

        # ── Bollinger Bands (21-23) ──
        if sma20 is not None and i >= 19:
            window_closes = closes[i-19:i+1]
            bb_std = (sum((x - sma20)**2 for x in window_closes) / 20) ** 0.5
            upper_band = sma20 + 2 * bb_std
            lower_band = sma20 - 2 * bb_std
            feats[i, 21] = (upper_band - cl) / cl_safe
            feats[i, 22] = (cl - lower_band) / cl_safe
            if sma20 > 1e-15:
                feats[i, 23] = (upper_band - lower_band) / sma20

        # ── Volume Indicators (24-27) ──
        vol_sma5 = _sma(volumes, 5, i)
        if vol_sma5 is not None and vol_sma5 > 1e-15:
            feats[i, 24] = v / vol_sma5
        vol_sma20 = _sma(volumes, 20, i)
        if vol_sma20 is not None and vol_sma20 > 1e-15:
            feats[i, 25] = v / vol_sma20

        # OBV change (normalized)
        if i > 0 and abs(obv[i-1]) > 1e-15:
            feats[i, 26] = (obv[i] - obv[i-1]) / (abs(obv[i-1]) + 1)
        elif i > 0:
            feats[i, 26] = np.sign(obv[i] - obv[i-1]) * 0.01

        # VWAP approximation (20-period)
        if i >= 19:
            typical_prices = [(highs[j] + lows[j] + closes[j]) / 3 for j in range(i-19, i+1)]
            vols_window = volumes[i-19:i+1]
            total_vol = sum(vols_window)
            if total_vol > 1e-15:
                vwap = sum(tp * vol for tp, vol in zip(typical_prices, vols_window)) / total_vol
                feats[i, 27] = cl / max(vwap, 1e-15) - 1

        # ── Momentum / Oscillators (28-33) ──
        # Rate of Change
        if i >= 6 and closes[i-6] > 1e-15:
            feats[i, 28] = (cl - closes[i-6]) / closes[i-6]
        if i >= 12 and closes[i-12] > 1e-15:
            feats[i, 29] = (cl - closes[i-12]) / closes[i-12]

        # Stochastic %K(14)
        if i >= 13:
            lowest_low = min(lows[i-13:i+1])
            highest_high = max(highs[i-13:i+1])
            denom = highest_high - lowest_low
            if denom > 1e-15:
                stoch_k_raw[i] = ((cl - lowest_low) / denom) * 100
            else:
                stoch_k_raw[i] = 50.0
            feats[i, 30] = (stoch_k_raw[i] - 50.0) / 50.0  # normalize to [-1,1]

        # Stochastic %D (SMA3 of %K)
        if i >= 15:
            stoch_d = sum(stoch_k_raw[i-2:i+1]) / 3
            feats[i, 31] = (stoch_d - 50.0) / 50.0

        # ATR(14)
        if i >= 13:
            atr14 = sum(tr[i-13:i+1]) / 14
            feats[i, 32] = atr14 / cl_safe

        # 12-period volatility
        if i >= 11:
            lr_window12 = log_returns[i-11:i+1]
            mean_lr12 = sum(lr_window12) / 12
            var_lr12 = sum((lr - mean_lr12)**2 for lr in lr_window12) / 12
            feats[i, 33] = math.sqrt(var_lr12)

    return feats

NUM_FEATURES = 34

# Feature names for display/debugging
FEATURE_NAMES = [
    "log_return", "high_low_range", "open_close_body", "upper_wick", "lower_wick",
    "log_volume", "volume_change", "close_sma5_ratio", "close_sma12_ratio", "volatility_5",
    "ema_9_ratio", "ema_21_ratio", "sma_20_ratio", "ema_9_21_cross", "sma_5_20_cross",
    "rsi_14", "rsi_7", "rsi_delta",
    "macd_line", "macd_signal", "macd_histogram",
    "bb_upper_dist", "bb_lower_dist", "bb_width",
    "volume_sma5_ratio", "volume_sma20_ratio", "obv_change", "vwap_ratio",
    "roc_6", "roc_12", "stoch_k", "stoch_d", "atr_14", "volatility_12",
]


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
    print(f"\nFeature names ({NUM_FEATURES}):")
    for i, name in enumerate(FEATURE_NAMES):
        print(f"  {i:2d}: {name}")
