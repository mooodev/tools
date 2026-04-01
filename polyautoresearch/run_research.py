#!/usr/bin/env python3
"""
Autonomous research loop for polyautoresearch.

Inspired by autoresearch-mlx: iteratively modifies train.py,
evaluates results, and keeps/discards changes automatically.

This script is used by an AI agent to run experiments autonomously.
Human can also run it manually to evaluate the current train.py.

Usage:
    python run_research.py              # Single evaluation
    python run_research.py --baseline   # Set current as baseline
"""

import os
import sys
import subprocess
import argparse
import time
from datetime import datetime

# Ensure we're in the project directory
PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(PROJECT_DIR)

sys.path.insert(0, PROJECT_DIR)

RESULTS_FILE = "results.tsv"


def get_git_hash() -> str:
    """Get current short git commit hash."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True, text=True, cwd=PROJECT_DIR
        )
        return result.stdout.strip()
    except Exception:
        return "unknown"


def run_evaluation() -> dict:
    """Run the evaluation and return metrics."""
    from infrastructure.evaluator import evaluate
    return evaluate(data_dir="data", verbose=True)


def log_result(commit: str, metrics: dict, status: str, description: str = ""):
    """Append result to results.tsv."""
    header_needed = not os.path.exists(RESULTS_FILE) or os.path.getsize(RESULTS_FILE) == 0

    with open(RESULTS_FILE, "a") as f:
        if header_needed:
            f.write("timestamp\tcommit\ttotal_pnl\tavg_pnl_per_block\twin_rate\t"
                    "expire_rate\ttotal_trades\tprofitable_block_pct\ttrain_time\t"
                    "status\tdescription\n")

        f.write(
            f"{datetime.now().isoformat()}\t"
            f"{commit}\t"
            f"{metrics.get('total_pnl', 'error')}\t"
            f"{metrics.get('avg_pnl_per_block', 'error')}\t"
            f"{metrics.get('win_rate', 'error')}\t"
            f"{metrics.get('expire_rate', 'error')}\t"
            f"{metrics.get('total_trades', 'error')}\t"
            f"{metrics.get('profitable_block_pct', 'error')}\t"
            f"{metrics.get('train_time_sec', 'error')}\t"
            f"{status}\t"
            f"{description}\n"
        )


def main():
    parser = argparse.ArgumentParser(description="Polyautoresearch evaluation runner")
    parser.add_argument("--baseline", action="store_true", help="Set current as baseline")
    parser.add_argument("--description", "-d", type=str, default="", help="Experiment description")
    args = parser.parse_args()

    commit = get_git_hash()
    print(f"\n{'='*60}")
    print(f"  Polyautoresearch Evaluation")
    print(f"  Commit: {commit}")
    print(f"  Time: {datetime.now().isoformat()}")
    print(f"{'='*60}\n")

    try:
        metrics = run_evaluation()
    except FileNotFoundError as e:
        print(f"\nERROR: {e}")
        print("Place your 15m block JSON files in the data/ directory.")
        sys.exit(1)
    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
        log_result(commit, {"total_pnl": "error"}, "error", str(e))
        sys.exit(1)

    if "error" in metrics:
        log_result(commit, metrics, "error", metrics["error"])
        print(f"\nExperiment FAILED: {metrics['error']}")
        sys.exit(1)

    status = "baseline" if args.baseline else "experiment"
    log_result(commit, metrics, status, args.description)

    print(f"\nLogged to {RESULTS_FILE} (status: {status})")

    # Read previous best for comparison
    if not args.baseline and os.path.exists(RESULTS_FILE):
        with open(RESULTS_FILE, "r") as f:
            lines = f.readlines()

        best_pnl = float("-inf")
        for line in lines[1:-1]:  # skip header and current result
            parts = line.strip().split("\t")
            try:
                pnl = float(parts[2])
                if pnl > best_pnl:
                    best_pnl = pnl
            except (ValueError, IndexError):
                continue

        if best_pnl > float("-inf"):
            current_pnl = metrics["total_pnl"]
            if current_pnl > best_pnl:
                print(f"\n  IMPROVED! {best_pnl:+.4f} -> {current_pnl:+.4f} (keep)")
            else:
                print(f"\n  No improvement: {best_pnl:+.4f} vs {current_pnl:+.4f} (discard)")


if __name__ == "__main__":
    main()
