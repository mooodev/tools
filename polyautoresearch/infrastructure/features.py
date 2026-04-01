"""
Feature extraction from 15m orderbook blocks.

Converts raw bid/ask time series into numerical feature vectors
for ML model consumption. Includes within-block features and
cross-block (historical context) features.

READ-ONLY: Do not modify this file. Only train.py is editable.
"""

import numpy as np
from typing import Optional


def compute_block_features(yes_series: list[dict], no_series: list[dict]) -> dict:
    """
    Compute summary features for a single 15m block.

    Returns dict of scalar features describing the block's price action.
    """
    if not yes_series:
        return {}

    bids = np.array([e["topBid"] for e in yes_series])
    asks = np.array([e["topAsk"] for e in yes_series])
    times = np.array([e["epoch"] for e in yes_series])

    # Relative times (seconds from block start)
    rel_times = times - times[0]

    # Basic price stats
    spreads = asks - bids
    midpoints = (asks + bids) / 2.0

    features = {
        # Opening/closing values
        "open_bid": bids[0],
        "open_ask": asks[0],
        "close_bid": bids[-1],
        "close_ask": asks[-1],
        "open_mid": midpoints[0],
        "close_mid": midpoints[-1],

        # Price movement
        "bid_change": bids[-1] - bids[0],
        "ask_change": asks[-1] - asks[0],
        "mid_change": midpoints[-1] - midpoints[0],

        # Spread stats
        "avg_spread": float(np.mean(spreads)),
        "min_spread": float(np.min(spreads)),
        "max_spread": float(np.max(spreads)),

        # Volatility
        "bid_std": float(np.std(bids)),
        "ask_std": float(np.std(asks)),
        "mid_std": float(np.std(midpoints)),

        # Range
        "bid_high": float(np.max(bids)),
        "bid_low": float(np.min(bids)),
        "ask_high": float(np.max(asks)),
        "ask_low": float(np.min(asks)),
        "bid_range": float(np.max(bids) - np.min(bids)),
        "ask_range": float(np.max(asks) - np.min(asks)),

        # Momentum (first vs second half)
        "n_ticks": len(bids),
        "duration_sec": float(rel_times[-1]) if len(rel_times) > 1 else 0.0,
    }

    # Halftime analysis
    half = len(bids) // 2
    if half > 0:
        features["first_half_mid_avg"] = float(np.mean(midpoints[:half]))
        features["second_half_mid_avg"] = float(np.mean(midpoints[half:]))
        features["half_momentum"] = features["second_half_mid_avg"] - features["first_half_mid_avg"]
    else:
        features["first_half_mid_avg"] = features["open_mid"]
        features["second_half_mid_avg"] = features["close_mid"]
        features["half_momentum"] = 0.0

    # Price velocity (per second)
    if features["duration_sec"] > 0:
        features["bid_velocity"] = features["bid_change"] / features["duration_sec"]
        features["ask_velocity"] = features["ask_change"] / features["duration_sec"]
    else:
        features["bid_velocity"] = 0.0
        features["ask_velocity"] = 0.0

    # NO-side context
    if no_series:
        no_bids = np.array([e["topBid"] for e in no_series])
        no_asks = np.array([e["topAsk"] for e in no_series])
        features["no_open_bid"] = no_bids[0]
        features["no_close_bid"] = no_bids[-1]
        features["no_bid_change"] = no_bids[-1] - no_bids[0]
        features["no_avg_bid"] = float(np.mean(no_bids))
    else:
        features["no_open_bid"] = 0.0
        features["no_close_bid"] = 0.0
        features["no_bid_change"] = 0.0
        features["no_avg_bid"] = 0.0

    return features


def build_orderbook_snapshot(
    yes_series: list[dict],
    n_ticks: int = 20
) -> np.ndarray:
    """
    Build a fixed-size orderbook snapshot from the last n_ticks of a YES series.

    Returns array of shape (n_ticks, 3): [bid, ask, spread] per tick.
    Pads with zeros if fewer ticks available.
    """
    bids = [e["topBid"] for e in yes_series]
    asks = [e["topAsk"] for e in yes_series]

    # Take last n_ticks
    bids = bids[-n_ticks:]
    asks = asks[-n_ticks:]

    snapshot = np.zeros((n_ticks, 3))
    offset = n_ticks - len(bids)

    for i, (b, a) in enumerate(zip(bids, asks)):
        snapshot[offset + i] = [b, a, a - b]

    return snapshot


def build_cross_block_features(
    blocks: list[dict],
    current_index: int,
    lookback: int = 3
) -> np.ndarray:
    """
    Build features from previous blocks to provide historical context.

    Uses the last `lookback` blocks before current_index.
    Returns flattened feature vector.
    """
    feature_keys = [
        "open_mid", "close_mid", "mid_change", "avg_spread",
        "bid_std", "mid_std", "bid_range", "half_momentum",
        "bid_velocity", "no_bid_change", "n_ticks",
    ]

    n_features = len(feature_keys)
    result = np.zeros(lookback * n_features)

    start = max(0, current_index - lookback)
    prev_blocks = blocks[start:current_index]

    for i, block in enumerate(prev_blocks):
        block_feats = compute_block_features(block["yes"], block["no"])
        offset = (lookback - len(prev_blocks) + i) * n_features
        for j, key in enumerate(feature_keys):
            result[offset + j] = block_feats.get(key, 0.0)

    return result


def build_tick_features(
    yes_series: list[dict],
    tick_index: int,
    window: int = 10,
    block_start_epoch: Optional[float] = None,
) -> np.ndarray:
    """
    Build per-tick features for a trading decision at tick_index.

    Looks back `window` ticks from the current position.
    Returns feature vector.
    """
    start = max(0, tick_index - window)
    recent = yes_series[start:tick_index + 1]

    if not recent:
        return np.zeros(15)

    bids = np.array([e["topBid"] for e in recent])
    asks = np.array([e["topAsk"] for e in recent])
    mids = (bids + asks) / 2.0
    spreads = asks - bids

    current = recent[-1]
    elapsed = 0.0
    if block_start_epoch is not None:
        elapsed = current["epoch"] - block_start_epoch

    features = np.array([
        current["topBid"],
        current["topAsk"],
        current["topAsk"] - current["topBid"],  # current spread
        float(np.mean(mids)),      # avg midpoint in window
        float(np.std(mids)) if len(mids) > 1 else 0.0,   # mid volatility
        float(np.mean(spreads)),   # avg spread in window
        mids[-1] - mids[0],       # price momentum in window
        float(np.max(bids)) - float(np.min(bids)),  # bid range in window
        float(np.max(asks)) - float(np.min(asks)),  # ask range in window
        bids[-1] - bids[0],       # bid change in window
        asks[-1] - asks[0],       # ask change in window
        elapsed,                   # seconds since block start
        elapsed / 900.0,           # fraction of 15m elapsed
        float(len(recent)),        # ticks in window
        float(tick_index),         # absolute tick position
    ])

    return features
