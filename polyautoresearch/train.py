"""
Polyautoresearch - Trading Strategy (EDITABLE)

This is the ONLY file the autonomous research agent should modify.
It contains the ML model, feature engineering, and trading strategy.

The agent iteratively experiments with:
- Model architecture and hyperparameters
- Feature selection and engineering
- Trading logic (buy/sell signals, buy windows, position management)
- Cross-block context usage

Must expose:
    train_and_predict(train_blocks, test_blocks) -> list[list[dict]]
        Returns one signal list per test block.
        Each signal list has one signal dict per YES tick.
        Signal dict: {"action": "buy"|"sell"|"hold"}

Data format per block:
    block = {
        "filepath": str,
        "block_index": int,
        "start_time": datetime,
        "end_time": datetime,
        "duration_sec": float,
        "raw": [...],      # all entries (YES + NO)
        "yes": [...],      # YES-side only, sorted by time
        "no": [...],       # NO-side only, sorted by time
    }

Each YES/NO entry:
    {"timestamp": datetime, "epoch": float, "side": str,
     "topBid": float, "topAsk": float}

Trading rules:
    - Buy at topAsk (you pay the ask to buy YES)
    - Sell at topBid (you receive the bid to sell YES)
    - Spread = ask - bid (always costs you to round-trip)
    - Open positions at end of 15m block -> value = 0 (total loss)
    - Goal: maximize total PnL across all test blocks
"""

import numpy as np
from infrastructure.features import (
    compute_block_features,
    build_orderbook_snapshot,
    build_cross_block_features,
    build_tick_features,
)

# === CONFIGURATION ===
MAX_POSITIONS = 1           # Max concurrent open positions
BUY_WINDOW_SEC = 300        # Only buy in first 5 minutes (300s) of 15m block
SELL_DEADLINE_SEC = 780     # Force sell by 13 minutes to avoid expiry
LOOKBACK_BLOCKS = 3         # Number of previous blocks for cross-block features
TICK_WINDOW = 10            # Ticks to look back for per-tick features
MIN_PROFIT_TARGET = 0.02    # Minimum bid increase to target (2 cents)
SPREAD_THRESHOLD = 0.02     # Max spread willing to pay


def extract_training_data(train_blocks, all_blocks):
    """
    Extract labeled training data from historical blocks.

    For each tick in each training block, we create features and a label:
    - Label = max future bid increase within the remaining block time
    - Positive label if buying at current ask and selling at future bid is profitable
    """
    X_list = []
    y_list = []

    for block in train_blocks:
        yes = block["yes"]
        if len(yes) < 20:
            continue

        block_start = yes[0]["epoch"]
        block_feats = compute_block_features(yes, block["no"])
        cross_feats = build_cross_block_features(all_blocks, block["block_index"], LOOKBACK_BLOCKS)

        for tick_idx in range(TICK_WINDOW, len(yes) - 5):
            entry = yes[tick_idx]
            elapsed = entry["epoch"] - block_start

            # Only generate training data for buy-window ticks
            if elapsed > BUY_WINDOW_SEC:
                continue

            current_ask = entry["topAsk"]

            # Find best future bid (for selling)
            future_bids = [yes[j]["topBid"] for j in range(tick_idx + 1, len(yes))]
            if not future_bids:
                continue

            best_future_bid = max(future_bids)
            potential_profit = best_future_bid - current_ask

            # Per-tick features
            tick_feats = build_tick_features(yes, tick_idx, TICK_WINDOW, block_start)

            # Combine all features
            features = np.concatenate([
                tick_feats,
                cross_feats,
                [block_feats.get("open_mid", 0.5)],
                [block_feats.get("bid_std", 0.0)],
                [block_feats.get("no_bid_change", 0.0)],
            ])

            X_list.append(features)
            y_list.append(potential_profit)

    if not X_list:
        return np.array([]).reshape(0, 0), np.array([])

    return np.array(X_list), np.array(y_list)


class SimpleModel:
    """
    Linear regression model for predicting profit potential.

    Uses numpy-only implementation (no heavy ML dependencies required).
    Can be swapped for sklearn, neural net, etc. by the research agent.
    """

    def __init__(self):
        self.weights = None
        self.bias = 0.0
        self.mean = None
        self.std = None

    def fit(self, X, y, lr=0.001, epochs=100, reg=0.01):
        """Train via gradient descent with L2 regularization."""
        if X.shape[0] == 0:
            return

        # Normalize features
        self.mean = np.mean(X, axis=0)
        self.std = np.std(X, axis=0) + 1e-8
        X_norm = (X - self.mean) / self.std

        n_samples, n_features = X_norm.shape
        self.weights = np.zeros(n_features)
        self.bias = 0.0

        for epoch in range(epochs):
            # Forward
            preds = X_norm @ self.weights + self.bias
            errors = preds - y

            # Gradients
            grad_w = (X_norm.T @ errors) / n_samples + reg * self.weights
            grad_b = np.mean(errors)

            # Update
            self.weights -= lr * grad_w
            self.bias -= lr * grad_b

    def predict(self, X):
        """Predict profit potential for feature vectors."""
        if self.weights is None or X.shape[0] == 0:
            return np.zeros(X.shape[0])

        X_norm = (X - self.mean) / self.std
        return X_norm @ self.weights + self.bias


def generate_signals(
    model,
    block,
    all_blocks,
    block_start_epoch,
):
    """
    Generate trading signals for a single test block.

    Strategy:
    1. Only buy within the buy window (first N minutes)
    2. Use model to predict profit potential at each tick
    3. Buy when predicted profit exceeds threshold
    4. Sell when current bid >= buy price + target, or force sell before deadline
    """
    yes = block["yes"]
    cross_feats = build_cross_block_features(all_blocks, block["block_index"], LOOKBACK_BLOCKS)
    block_feats = compute_block_features(yes, block["no"])

    signals = []
    current_position = None  # (buy_price, buy_tick)

    for tick_idx, entry in enumerate(yes):
        elapsed = entry["epoch"] - block_start_epoch
        signal = {"action": "hold"}

        if current_position is not None:
            buy_price = current_position[0]
            current_bid = entry["topBid"]
            profit = current_bid - buy_price

            # Sell conditions:
            # 1. Hit profit target
            # 2. Approaching deadline (force sell to avoid expiry at 0)
            # 3. Stop loss: price dropped significantly
            if profit >= MIN_PROFIT_TARGET:
                signal = {"action": "sell"}
                current_position = None
            elif elapsed >= SELL_DEADLINE_SEC:
                # Force sell to avoid expiry - even at a loss, bid > 0 is better than 0
                if current_bid > 0:
                    signal = {"action": "sell"}
                    current_position = None
            elif profit < -0.10:
                # Stop loss at -10 cents
                if current_bid > 0:
                    signal = {"action": "sell"}
                    current_position = None

        elif elapsed <= BUY_WINDOW_SEC and tick_idx >= TICK_WINDOW:
            # Consider buying
            spread = entry["topAsk"] - entry["topBid"]

            if spread <= SPREAD_THRESHOLD:
                # Build features and predict
                tick_feats = build_tick_features(yes, tick_idx, TICK_WINDOW, block_start_epoch)
                features = np.concatenate([
                    tick_feats,
                    cross_feats,
                    [block_feats.get("open_mid", 0.5)],
                    [block_feats.get("bid_std", 0.0)],
                    [block_feats.get("no_bid_change", 0.0)],
                ])

                pred_profit = model.predict(features.reshape(1, -1))[0]

                if pred_profit > MIN_PROFIT_TARGET:
                    signal = {"action": "buy"}
                    current_position = (entry["topAsk"], tick_idx)

        signals.append(signal)

    return signals


def train_and_predict(train_blocks, test_blocks):
    """
    Main entry point called by the evaluation framework.

    1. Extract features and labels from training blocks
    2. Train the model
    3. Generate signals for each test block

    Returns: list of signal lists (one per test block)
    """
    # Build the full block list for cross-block features
    all_blocks = train_blocks + test_blocks

    # Extract training data
    X_train, y_train = extract_training_data(train_blocks, all_blocks)

    # Train model
    model = SimpleModel()
    if X_train.shape[0] > 0:
        print(f"  Training on {X_train.shape[0]} samples, {X_train.shape[1]} features")
        model.fit(X_train, y_train, lr=0.001, epochs=200, reg=0.01)
    else:
        print("  WARNING: No training data extracted. Using default signals.")

    # Generate signals for each test block
    all_signals = []
    for block in test_blocks:
        yes = block["yes"]
        if not yes:
            all_signals.append([])
            continue

        block_start = yes[0]["epoch"]
        signals = generate_signals(model, block, all_blocks, block_start)
        all_signals.append(signals)

    return all_signals
