"""
Evaluation framework for polyautoresearch experiments.

Loads data, runs the strategy from train.py, backtests, and reports results.
This is the fixed evaluation harness - the agent only modifies train.py.

READ-ONLY: Do not modify this file. Only train.py is editable.
"""

import sys
import os
import time
import importlib
import traceback

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from infrastructure.data_loader import load_all_blocks, split_train_test
from infrastructure.backtester import run_backtest, aggregate_results


def evaluate(data_dir: str = "data", test_ratio: float = 0.2, verbose: bool = True) -> dict:
    """
    Full evaluation pipeline:
    1. Load all 15m blocks
    2. Split into train/test chronologically
    3. Import train.py and call train_and_predict()
    4. Backtest predictions on test set
    5. Return metrics

    train.py must expose:
        train_and_predict(train_blocks, test_blocks) -> list[list[dict]]
            Returns a list of signal lists, one per test block.
            Each signal list has one signal dict per YES tick in that block.
            Signal dict: {"action": "buy"|"sell"|"hold"}
    """
    # Load data
    if verbose:
        print(f"Loading blocks from {data_dir}/...")
    blocks = load_all_blocks(data_dir)
    if verbose:
        print(f"  Loaded {len(blocks)} blocks")

    # Split
    train_blocks, test_blocks = split_train_test(blocks, test_ratio=test_ratio)
    if verbose:
        print(f"  Train: {len(train_blocks)} blocks, Test: {len(test_blocks)} blocks")

    # Import train.py dynamically
    if verbose:
        print("Running train_and_predict()...")

    start_time = time.time()

    # Reload train module each time
    if "train" in sys.modules:
        del sys.modules["train"]

    import train as train_module

    try:
        all_signals = train_module.train_and_predict(train_blocks, test_blocks)
    except Exception as e:
        print(f"ERROR in train_and_predict: {e}")
        traceback.print_exc()
        return {"error": str(e), "total_pnl": float("-inf")}

    elapsed = time.time() - start_time
    if verbose:
        print(f"  Completed in {elapsed:.1f}s")

    # Validate signals
    if len(all_signals) != len(test_blocks):
        print(f"ERROR: Expected {len(test_blocks)} signal lists, got {len(all_signals)}")
        return {"error": "signal count mismatch", "total_pnl": float("-inf")}

    # Backtest each test block
    block_results = []
    for i, (block, signals) in enumerate(zip(test_blocks, all_signals)):
        yes = block["yes"]

        if len(signals) != len(yes):
            print(f"WARNING: Block {i} has {len(yes)} YES ticks but {len(signals)} signals. Truncating.")
            min_len = min(len(yes), len(signals))
            yes = yes[:min_len]
            signals = signals[:min_len]

        max_positions = getattr(train_module, "MAX_POSITIONS", 1)

        result = run_backtest(
            yes_series=yes,
            signals=signals,
            block_index=block["block_index"],
            filepath=block["filepath"],
            max_positions=max_positions,
        )
        block_results.append(result)

    # Aggregate
    metrics = aggregate_results(block_results)
    metrics["train_time_sec"] = elapsed
    metrics["n_train_blocks"] = len(train_blocks)
    metrics["n_test_blocks"] = len(test_blocks)

    if verbose:
        print("\n=== RESULTS ===")
        print(f"  Total PnL:          {metrics['total_pnl']:+.4f}")
        print(f"  Avg PnL/block:      {metrics['avg_pnl_per_block']:+.4f}")
        print(f"  Profitable blocks:  {metrics['profitable_blocks']}/{metrics['n_blocks']} "
              f"({metrics['profitable_block_pct']:.1%})")
        print(f"  Total trades:       {metrics['total_trades']}")
        print(f"  Expired (loss):     {metrics['total_expired']} ({metrics['expire_rate']:.1%})")
        print(f"  Win rate (closed):  {metrics['win_rate']:.1%}")
        print(f"  Avg win:            {metrics['avg_win']:+.4f}")
        print(f"  Avg loss:           {metrics['avg_loss']:+.4f}")
        print(f"  Max drawdown:       {metrics['max_drawdown']:.4f}")
        print(f"  Train time:         {metrics['train_time_sec']:.1f}s")

    return metrics


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)) + "/..")
    evaluate()
