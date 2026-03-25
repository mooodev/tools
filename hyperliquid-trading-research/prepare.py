"""
Data preparation for Hyperliquid altcoin trading research.

Loads multi-timeframe candle data (15m, 1h, 4h) from hyperliquid-candles,
merges BTC candles into altcoin feature sets (BTC as market leader),
engineers features, and creates train/val datasets.

This file is STATIC — do not modify during autoresearch experiments.
"""

import json
import math
import os
import numpy as np
from pathlib import Path

# ── Paths ────────────────────────────────────────────────────────────────────

CANDLES_DIR = Path(__file__).parent.parent / "hyperliquid-candles"
DATA_15M = CANDLES_DIR / "15mdata"
DATA_1H = CANDLES_DIR / "1hdata"
DATA_4H = CANDLES_DIR / "4hdata"

VAL_FRACTION = 0.2
MIN_CANDLES = 100        # minimum 1h candles to use a coin
BTC_SYMBOL = "BTC"

# Timeframe durations in milliseconds
MS_15M = 15 * 60 * 1000
MS_1H = 60 * 60 * 1000
MS_4H = 4 * 60 * 60 * 1000

# ── Feature counts ───────────────────────────────────────────────────────────

N_ALT_1H = 20    # alt 1h features
N_ALT_15M = 7    # alt 15m sub-candle features
N_ALT_4H = 7     # alt 4h context features
N_BTC_1H = 7     # btc 1h features
N_BTC_4H = 3     # btc 4h features
N_CROSS = 2      # cross features (btc vs alt)

NUM_FEATURES = N_ALT_1H + N_ALT_15M + N_ALT_4H + N_BTC_1H + N_BTC_4H + N_CROSS  # 46

FEATURE_NAMES = [
    # Alt 1h (0-19)
    "log_return", "high_low_pct", "body_pct", "upper_wick_pct", "lower_wick_pct",
    "log_volume", "volume_change", "rsi_14_norm", "macd_hist_norm", "bb_position",
    "bb_width", "atr_norm", "adx_norm", "stoch_k_norm", "stoch_d_norm",
    "cci_norm", "williams_r_norm", "sma20_ratio", "sma50_ratio", "ema12_ratio",
    # Alt 15m sub-candle (20-26)
    "15m_momentum", "15m_volatility", "15m_volume_trend", "15m_max_range_ratio",
    "15m_positive_count", "15m_latest_rsi", "15m_latest_macd",
    # Alt 4h context (27-33)
    "4h_return", "4h_range", "4h_rsi_norm", "4h_macd_hist_norm",
    "4h_bb_position", "4h_adx_norm", "4h_trend",
    # BTC 1h (34-40)
    "btc_1h_return", "btc_1h_rsi_norm", "btc_1h_macd_hist_norm",
    "btc_1h_bb_position", "btc_1h_volume_change", "btc_1h_adx_norm", "btc_1h_atr_norm",
    # BTC 4h (41-43)
    "btc_4h_return", "btc_4h_rsi_norm", "btc_4h_trend",
    # Cross (44-45)
    "btc_alt_return_diff", "btc_alt_strength",
]

assert len(FEATURE_NAMES) == NUM_FEATURES, f"Expected {NUM_FEATURES} feature names, got {len(FEATURE_NAMES)}"

# ── Fee constants ────────────────────────────────────────────────────────────

FEE_PER_SIDE = 0.0005   # 0.05% per trade
ROUND_TRIP_FEE = 2 * FEE_PER_SIDE  # 0.10% total


# ── Helpers ──────────────────────────────────────────────────────────────────

def _safe_float(v, default=0.0):
    if v is None:
        return default
    try:
        return float(v)
    except (ValueError, TypeError):
        return default


def _safe_log(x):
    return math.log(max(abs(x), 1e-15))


def _safe_div(a, b, default=0.0):
    if abs(b) < 1e-15:
        return default
    return a / b


# ── Data Loading ─────────────────────────────────────────────────────────────

def load_candles(filepath):
    """Load candle JSON file, return list of candle dicts with float values."""
    with open(filepath) as f:
        raw = json.load(f)

    candles = []
    for c in raw:
        candles.append({
            "t": int(c["t"]),         # open time ms
            "T": int(c["T"]),         # close time ms
            "o": _safe_float(c["o"]),
            "c": _safe_float(c["c"]),
            "h": _safe_float(c["h"]),
            "l": _safe_float(c["l"]),
            "v": _safe_float(c["v"]),
            # Pre-computed indicators
            "SMA_20": _safe_float(c.get("SMA_20")),
            "SMA_50": _safe_float(c.get("SMA_50")),
            "SMA_200": _safe_float(c.get("SMA_200")),
            "EMA_12": _safe_float(c.get("EMA_12")),
            "EMA_26": _safe_float(c.get("EMA_26")),
            "MACD": _safe_float(c.get("MACD")),
            "MACD_signal": _safe_float(c.get("MACD_signal")),
            "MACD_histogram": _safe_float(c.get("MACD_histogram")),
            "RSI_14": _safe_float(c.get("RSI_14"), 50.0),
            "BB_upper": _safe_float(c.get("BB_upper")),
            "BB_middle": _safe_float(c.get("BB_middle")),
            "BB_lower": _safe_float(c.get("BB_lower")),
            "ATR_14": _safe_float(c.get("ATR_14")),
            "OBV": _safe_float(c.get("OBV")),
            "VWAP": _safe_float(c.get("VWAP")),
            "Stoch_K": _safe_float(c.get("Stoch_K"), 50.0),
            "Stoch_D": _safe_float(c.get("Stoch_D"), 50.0),
            "ADX_14": _safe_float(c.get("ADX_14")),
            "CCI_20": _safe_float(c.get("CCI_20")),
            "Williams_%R_14": _safe_float(c.get("Williams_%R_14"), -50.0),
        })
    return candles


def load_all_coins():
    """
    Load all coin data across all three timeframes.
    Returns dict: { coin_name: { "1h": [...], "15m": [...], "4h": [...] } }
    """
    coins = {}

    # Load 1h data (primary)
    if not DATA_1H.exists():
        raise FileNotFoundError(f"1h data directory not found: {DATA_1H}\n"
                                "Run hyperliquid-candles/fetch_candles.py first.")

    for f in sorted(DATA_1H.glob("*.json")):
        coin = f.stem
        candles = load_candles(f)
        if len(candles) < MIN_CANDLES:
            continue
        coins[coin] = {"1h": candles, "15m": [], "4h": []}

    # Load 15m data
    if DATA_15M.exists():
        for f in sorted(DATA_15M.glob("*.json")):
            coin = f.stem
            if coin in coins:
                coins[coin]["15m"] = load_candles(f)

    # Load 4h data
    if DATA_4H.exists():
        for f in sorted(DATA_4H.glob("*.json")):
            coin = f.stem
            if coin in coins:
                coins[coin]["4h"] = load_candles(f)

    if not coins:
        raise ValueError(f"No coins with >= {MIN_CANDLES} 1h candles found.")

    # Ensure BTC is loaded
    if BTC_SYMBOL not in coins:
        raise ValueError(f"BTC data not found. Ensure BTC is in the top coins fetched.")

    print(f"Loaded {len(coins)} coins from {CANDLES_DIR}")
    return coins


def build_time_index(candles):
    """Build a dict mapping open_time_ms -> candle for fast lookup."""
    return {c["t"]: c for c in candles}


# ── Feature Engineering ──────────────────────────────────────────────────────

def extract_alt_1h_features(candle, prev_candle):
    """Extract 20 features from a single 1h altcoin candle."""
    feats = np.zeros(N_ALT_1H, dtype=np.float32)
    c = candle
    o, h, l, cl, v = c["o"], c["h"], c["l"], c["c"], c["v"]
    cl_safe = max(cl, 1e-15)

    # 0: log return
    if prev_candle:
        prev_cl = max(prev_candle["c"], 1e-15)
        feats[0] = math.log(cl_safe / prev_cl)

    # 1: high-low range
    feats[1] = (h - l) / cl_safe

    # 2: body percent
    feats[2] = (cl - o) / cl_safe

    # 3: upper wick
    feats[3] = (h - max(o, cl)) / cl_safe

    # 4: lower wick
    feats[4] = (min(o, cl) - l) / cl_safe

    # 5: log volume
    feats[5] = math.log(v + 1)

    # 6: volume change
    if prev_candle:
        prev_v = max(prev_candle["v"], 1e-15)
        feats[6] = (v - prev_v) / (prev_v + 1)

    # 7: RSI normalized to [-1, 1]
    feats[7] = (c["RSI_14"] - 50.0) / 50.0

    # 8: MACD histogram normalized
    feats[8] = c["MACD_histogram"] / cl_safe

    # 9: BB position [0, 1]
    bb_range = c["BB_upper"] - c["BB_lower"]
    if bb_range > 1e-15:
        feats[9] = (cl - c["BB_lower"]) / bb_range
    else:
        feats[9] = 0.5

    # 10: BB width
    feats[10] = _safe_div(bb_range, c["BB_middle"]) if c["BB_middle"] > 1e-15 else 0.0

    # 11: ATR normalized
    feats[11] = c["ATR_14"] / cl_safe

    # 12: ADX normalized
    feats[12] = c["ADX_14"] / 100.0

    # 13: Stochastic K normalized
    feats[13] = (c["Stoch_K"] - 50.0) / 50.0

    # 14: Stochastic D normalized
    feats[14] = (c["Stoch_D"] - 50.0) / 50.0

    # 15: CCI normalized (clip to [-1, 1])
    feats[15] = max(-1.0, min(1.0, c["CCI_20"] / 200.0))

    # 16: Williams %R normalized
    feats[16] = (c["Williams_%R_14"] + 50.0) / 50.0

    # 17: SMA 20 ratio
    if c["SMA_20"] > 1e-15:
        feats[17] = cl / c["SMA_20"] - 1.0

    # 18: SMA 50 ratio
    if c["SMA_50"] > 1e-15:
        feats[18] = cl / c["SMA_50"] - 1.0

    # 19: EMA 12 ratio
    if c["EMA_12"] > 1e-15:
        feats[19] = cl / c["EMA_12"] - 1.0

    return feats


def extract_15m_sub_features(candles_15m_window):
    """
    Extract 7 features from the 4 x 15m candles within a 1h window.
    candles_15m_window: list of up to 4 15m candles sorted by time.
    """
    feats = np.zeros(N_ALT_15M, dtype=np.float32)

    if not candles_15m_window or len(candles_15m_window) < 2:
        return feats

    opens = [c["o"] for c in candles_15m_window]
    closes = [c["c"] for c in candles_15m_window]
    highs = [c["h"] for c in candles_15m_window]
    lows = [c["l"] for c in candles_15m_window]
    volumes = [c["v"] for c in candles_15m_window]

    first_open = max(opens[0], 1e-15)
    last_close = closes[-1]

    # 0: momentum (last close vs first open)
    feats[0] = (last_close - first_open) / first_open

    # 1: volatility (std of 15m returns)
    returns_15m = []
    for i in range(1, len(closes)):
        prev_cl = max(closes[i-1], 1e-15)
        returns_15m.append(math.log(max(closes[i], 1e-15) / prev_cl))
    if returns_15m:
        mean_r = sum(returns_15m) / len(returns_15m)
        var_r = sum((r - mean_r)**2 for r in returns_15m) / len(returns_15m)
        feats[1] = math.sqrt(var_r)

    # 2: volume trend (normalized slope)
    n = len(volumes)
    if n >= 2:
        total_vol = sum(volumes)
        if total_vol > 1e-15:
            avg_vol = total_vol / n
            # Simple slope: (last - first) / avg
            feats[2] = (volumes[-1] - volumes[0]) / (avg_vol + 1)

    # 3: max range ratio vs average
    ranges = [h - l for h, l in zip(highs, lows)]
    avg_range = sum(ranges) / len(ranges) if ranges else 1e-15
    if avg_range > 1e-15:
        feats[3] = max(ranges) / avg_range - 1.0

    # 4: count of positive 15m candles / total
    positive = sum(1 for c, o in zip(closes, opens) if c >= o)
    feats[4] = positive / len(closes)

    # 5: latest 15m RSI (normalized)
    latest = candles_15m_window[-1]
    feats[5] = (latest["RSI_14"] - 50.0) / 50.0

    # 6: latest 15m MACD histogram (normalized)
    cl_safe = max(latest["c"], 1e-15)
    feats[6] = latest["MACD_histogram"] / cl_safe

    return feats


def extract_4h_features(candle_4h, prev_candle_4h):
    """Extract 7 features from the 4h candle context."""
    feats = np.zeros(N_ALT_4H, dtype=np.float32)

    if candle_4h is None:
        return feats

    c = candle_4h
    cl = max(c["c"], 1e-15)

    # 0: 4h return
    if prev_candle_4h:
        prev_cl = max(prev_candle_4h["c"], 1e-15)
        feats[0] = math.log(cl / prev_cl)

    # 1: 4h range
    feats[1] = (c["h"] - c["l"]) / cl

    # 2: 4h RSI normalized
    feats[2] = (c["RSI_14"] - 50.0) / 50.0

    # 3: 4h MACD histogram normalized
    feats[3] = c["MACD_histogram"] / cl

    # 4: 4h BB position
    bb_range = c["BB_upper"] - c["BB_lower"]
    if bb_range > 1e-15:
        feats[4] = (cl - c["BB_lower"]) / bb_range
    else:
        feats[4] = 0.5

    # 5: 4h ADX normalized
    feats[5] = c["ADX_14"] / 100.0

    # 6: 4h trend (SMA20 ratio as proxy)
    if c["SMA_20"] > 1e-15:
        feats[6] = cl / c["SMA_20"] - 1.0

    return feats


def extract_btc_1h_features(btc_candle, prev_btc_candle):
    """Extract 7 features from BTC 1h candle."""
    feats = np.zeros(N_BTC_1H, dtype=np.float32)

    if btc_candle is None:
        return feats

    c = btc_candle
    cl = max(c["c"], 1e-15)

    # 0: BTC return
    if prev_btc_candle:
        prev_cl = max(prev_btc_candle["c"], 1e-15)
        feats[0] = math.log(cl / prev_cl)

    # 1: BTC RSI normalized
    feats[1] = (c["RSI_14"] - 50.0) / 50.0

    # 2: BTC MACD histogram normalized
    feats[2] = c["MACD_histogram"] / cl

    # 3: BTC BB position
    bb_range = c["BB_upper"] - c["BB_lower"]
    if bb_range > 1e-15:
        feats[3] = (cl - c["BB_lower"]) / bb_range
    else:
        feats[3] = 0.5

    # 4: BTC volume change
    if prev_btc_candle:
        prev_v = max(prev_btc_candle["v"], 1e-15)
        feats[4] = (c["v"] - prev_v) / (prev_v + 1)

    # 5: BTC ADX normalized
    feats[5] = c["ADX_14"] / 100.0

    # 6: BTC ATR normalized
    feats[6] = c["ATR_14"] / cl

    return feats


def extract_btc_4h_features(btc_4h_candle, prev_btc_4h_candle):
    """Extract 3 features from BTC 4h candle."""
    feats = np.zeros(N_BTC_4H, dtype=np.float32)

    if btc_4h_candle is None:
        return feats

    c = btc_4h_candle
    cl = max(c["c"], 1e-15)

    # 0: BTC 4h return
    if prev_btc_4h_candle:
        prev_cl = max(prev_btc_4h_candle["c"], 1e-15)
        feats[0] = math.log(cl / prev_cl)

    # 1: BTC 4h RSI normalized
    feats[1] = (c["RSI_14"] - 50.0) / 50.0

    # 2: BTC 4h trend
    if c["SMA_20"] > 1e-15:
        feats[2] = cl / c["SMA_20"] - 1.0

    return feats


def extract_cross_features(alt_return, btc_return, alt_returns_window, btc_returns_window):
    """Extract 2 cross-market features."""
    feats = np.zeros(N_CROSS, dtype=np.float32)

    # 0: BTC-alt return diff (positive = BTC outperforming)
    feats[0] = btc_return - alt_return

    # 1: BTC-alt strength (rolling correlation sign approximation)
    if len(alt_returns_window) >= 5 and len(btc_returns_window) >= 5:
        # Simple dot product of recent returns as correlation proxy
        alt_arr = np.array(alt_returns_window[-20:])
        btc_arr = np.array(btc_returns_window[-20:])
        n = min(len(alt_arr), len(btc_arr))
        if n >= 5:
            alt_arr = alt_arr[-n:]
            btc_arr = btc_arr[-n:]
            alt_dm = alt_arr - alt_arr.mean()
            btc_dm = btc_arr - btc_arr.mean()
            denom = (np.sqrt(np.sum(alt_dm**2)) * np.sqrt(np.sum(btc_dm**2)))
            if denom > 1e-15:
                feats[1] = np.sum(alt_dm * btc_dm) / denom

    return feats


# ── Multi-Timeframe Feature Matrix ──────────────────────────────────────────

def build_feature_matrix(coin_data, btc_data):
    """
    Build the full feature matrix for one altcoin.

    Aligns on 1h timestamps as the primary timeframe.
    Adds 15m sub-candle details, 4h context, and BTC features.

    Returns:
        feats: np.array (N, NUM_FEATURES)
        candles_1h: list of 1h candles (for computing targets)
    """
    candles_1h = coin_data["1h"]
    candles_15m = coin_data.get("15m", [])
    candles_4h = coin_data.get("4h", [])

    btc_1h = btc_data.get("1h", [])
    btc_4h = btc_data.get("4h", [])

    # Build time indices
    idx_15m = build_time_index(candles_15m)
    idx_4h = build_time_index(candles_4h)
    idx_btc_1h = build_time_index(btc_1h)
    idx_btc_4h = build_time_index(btc_4h)

    # Sort 4h candles by time for prev lookup
    sorted_4h_times = sorted(idx_4h.keys())
    sorted_btc_4h_times = sorted(idx_btc_4h.keys())

    n = len(candles_1h)
    feats = np.zeros((n, NUM_FEATURES), dtype=np.float32)

    alt_returns = []
    btc_returns = []

    for i, candle in enumerate(candles_1h):
        t = candle["t"]
        prev_candle = candles_1h[i - 1] if i > 0 else None
        offset = N_ALT_1H

        # ── Alt 1h features (0-19) ──
        feats[i, :N_ALT_1H] = extract_alt_1h_features(candle, prev_candle)
        alt_ret = feats[i, 0]  # log_return
        alt_returns.append(alt_ret)

        # ── Alt 15m sub-features (20-26) ──
        # Find 4 x 15m candles within this hour: t, t+15m, t+30m, t+45m
        sub_15m = []
        for k in range(4):
            t_15m = t + k * MS_15M
            if t_15m in idx_15m:
                sub_15m.append(idx_15m[t_15m])
        feats[i, offset:offset + N_ALT_15M] = extract_15m_sub_features(sub_15m)
        offset += N_ALT_15M

        # ── Alt 4h context features (27-33) ──
        # Find the 4h candle that contains this 1h candle
        t_4h = t - (t % MS_4H)
        candle_4h = idx_4h.get(t_4h)
        # Previous 4h candle
        prev_4h = None
        prev_t_4h = t_4h - MS_4H
        prev_4h = idx_4h.get(prev_t_4h)
        feats[i, offset:offset + N_ALT_4H] = extract_4h_features(candle_4h, prev_4h)
        offset += N_ALT_4H

        # ── BTC 1h features (34-40) ──
        btc_1h_candle = idx_btc_1h.get(t)
        prev_btc_1h = idx_btc_1h.get(t - MS_1H)
        btc_feats_1h = extract_btc_1h_features(btc_1h_candle, prev_btc_1h)
        feats[i, offset:offset + N_BTC_1H] = btc_feats_1h
        btc_ret = btc_feats_1h[0]  # btc return
        btc_returns.append(btc_ret)
        offset += N_BTC_1H

        # ── BTC 4h features (41-43) ──
        btc_4h_candle = idx_btc_4h.get(t_4h)
        prev_btc_4h = idx_btc_4h.get(prev_t_4h)
        feats[i, offset:offset + N_BTC_4H] = extract_btc_4h_features(btc_4h_candle, prev_btc_4h)
        offset += N_BTC_4H

        # ── Cross features (44-45) ──
        feats[i, offset:offset + N_CROSS] = extract_cross_features(
            alt_ret, btc_ret, alt_returns, btc_returns
        )

    return feats, candles_1h


# ── Dataset Construction ─────────────────────────────────────────────────────

def build_windows(feats, candles, window_size=24, horizon=1):
    """
    Build sliding windows and targets.

    X: (N, window_size, NUM_FEATURES) — lookback windows
    y: (N,) — future log return over horizon candles

    The target is the log return: ln(close[i+horizon] / close[i])
    """
    n = feats.shape[0]
    X_list, y_list = [], []

    for i in range(window_size, n - horizon):
        window = feats[i - window_size:i]

        # Target: log return over the forecast horizon
        future_close = max(candles[i + horizon - 1]["c"], 1e-15)
        current_close = max(candles[i - 1]["c"], 1e-15)
        target_return = math.log(future_close / current_close)

        X_list.append(window)
        y_list.append(target_return)

    if not X_list:
        return np.array([]), np.array([])

    return np.array(X_list, dtype=np.float32), np.array(y_list, dtype=np.float32)


def prepare_data(window_size=24, horizon=1):
    """
    Full pipeline: load → features → windows → train/val split.

    Returns dict with numpy arrays and metadata.
    """
    coins = load_all_coins()

    # Separate BTC data
    btc_data = coins.pop(BTC_SYMBOL)
    altcoins = {k: v for k, v in coins.items()}

    print(f"Processing {len(altcoins)} altcoins with BTC augmentation...")

    all_X, all_y = [], []
    coin_names = []

    for name, data in sorted(altcoins.items()):
        feats, candles_1h = build_feature_matrix(data, btc_data)
        X, y = build_windows(feats, candles_1h, window_size, horizon)

        if len(X) > 0:
            all_X.append(X)
            all_y.append(y)
            coin_names.append(name)
            print(f"  {name}: {len(X)} windows "
                  f"(1h={len(data['1h'])}, 15m={len(data.get('15m', []))}, "
                  f"4h={len(data.get('4h', []))})")

    if not all_X:
        raise ValueError("No valid training windows generated.")

    X = np.concatenate(all_X, axis=0)
    y = np.concatenate(all_y, axis=0)

    # Train/val split (last VAL_FRACTION chronologically)
    n_total = len(X)
    n_val = max(1, int(n_total * VAL_FRACTION))
    n_train = n_total - n_val

    X_train, X_val = X[:n_train], X[n_train:]
    y_train, y_val = y[:n_train], y[n_train:]

    # Z-score normalization from training set
    flat_train = X_train.reshape(-1, X_train.shape[-1])
    feat_mean = flat_train.mean(axis=0)
    feat_std = flat_train.std(axis=0) + 1e-8

    X_train = (X_train - feat_mean) / feat_std
    X_val = (X_val - feat_mean) / feat_std

    y_mean = float(y_train.mean())
    y_std = float(y_train.std() + 1e-8)

    print(f"\nDataset: {n_train} train, {n_val} val windows")
    print(f"Features: {NUM_FEATURES}, Window: {window_size}, Horizon: {horizon}")
    print(f"Target return — mean: {y_mean:.6f}, std: {y_std:.6f}")
    print(f"Coins used: {', '.join(coin_names)}")

    return {
        "X_train": X_train,
        "y_train": y_train,
        "X_val": X_val,
        "y_val": y_val,
        "feat_mean": feat_mean,
        "feat_std": feat_std,
        "y_mean": y_mean,
        "y_std": y_std,
        "n_train": n_train,
        "n_val": n_val,
        "coin_names": coin_names,
    }


# ── Trading Simulation ──────────────────────────────────────────────────────

def simulate_trading(predictions, actual_returns, threshold=0.0, fee=ROUND_TRIP_FEE):
    """
    Long-only trading simulation with realistic fees.

    Goes long when predicted return > threshold.
    Each trade incurs 0.05% fee on buy + 0.05% fee on sell = 0.10% round trip.

    Returns dict of performance metrics.
    """
    predictions = np.asarray(predictions, dtype=np.float64)
    actual_returns = np.asarray(actual_returns, dtype=np.float64)

    n = len(predictions)
    if n == 0:
        return _empty_metrics()

    # Position: long when prediction exceeds threshold
    positions = (predictions > threshold).astype(np.float64)

    # Detect trade entries (position change from 0 to 1)
    prev_positions = np.concatenate([[0.0], positions[:-1]])
    entries = ((positions == 1) & (prev_positions == 0)).astype(np.float64)
    exits = ((positions == 0) & (prev_positions == 1)).astype(np.float64)

    # Fee impact: deduct round-trip fee at each entry
    # More realistic: deduct half fee at entry, half at exit
    fee_costs = entries * (fee / 2) + exits * (fee / 2)
    # Also charge exit fee for positions still open at the end
    if positions[-1] == 1:
        fee_costs[-1] += fee / 2

    # Net returns after fees
    trade_returns = positions * actual_returns - fee_costs

    n_entries = int(entries.sum())
    if n_entries == 0:
        return _empty_metrics()

    total_return = float(trade_returns.sum())
    active_returns = trade_returns[positions > 0]
    mean_ret = float(active_returns.mean()) if len(active_returns) > 0 else 0.0
    std_ret = float(active_returns.std()) if len(active_returns) > 1 else 1.0

    # Annualized Sharpe (assuming hourly data)
    sharpe = (mean_ret / (std_ret + 1e-8)) * math.sqrt(24 * 365)

    win_rate = float((active_returns > 0).mean()) if len(active_returns) > 0 else 0.0

    # Max drawdown
    cum_returns = np.cumsum(trade_returns)
    peak = np.maximum.accumulate(cum_returns)
    drawdown = peak - cum_returns
    max_drawdown = float(drawdown.max()) if len(drawdown) > 0 else 0.0

    # Profit factor
    gross_profit = float(active_returns[active_returns > 0].sum()) if (active_returns > 0).any() else 0.0
    gross_loss = float(abs(active_returns[active_returns < 0].sum())) if (active_returns < 0).any() else 1e-15
    profit_factor = gross_profit / gross_loss

    return {
        "sharpe": round(sharpe, 4),
        "total_return": round(total_return, 6),
        "win_rate": round(win_rate, 4),
        "n_trades": n_entries,
        "max_drawdown": round(max_drawdown, 6),
        "profit_factor": round(profit_factor, 4),
        "mean_return_per_trade": round(float(mean_ret), 8),
        "total_fees_paid": round(float(fee_costs.sum()), 6),
    }


def _empty_metrics():
    return {
        "sharpe": 0.0, "total_return": 0.0, "win_rate": 0.0,
        "n_trades": 0, "max_drawdown": 0.0, "profit_factor": 0.0,
        "mean_return_per_trade": 0.0, "total_fees_paid": 0.0,
    }


if __name__ == "__main__":
    data = prepare_data()
    print("\nData preparation complete.")
    print(f"X_train shape: {data['X_train'].shape}")
    print(f"y_train shape: {data['y_train'].shape}")
    print(f"\nFeature names ({NUM_FEATURES}):")
    for i, name in enumerate(FEATURE_NAMES):
        print(f"  {i:2d}: {name}")
