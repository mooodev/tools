#!/usr/bin/env python3
"""
Autoresearch experiment runner for pump.fun trading bot.
Manages the git-based keep/revert loop for iterative model improvement.

This file is STATIC — do not modify during autoresearch experiments.

Usage:
    python run.py                    # run one experiment (manual mode)
    python run.py --baseline         # establish baseline
    python run.py --auto N           # run N automated experiments
"""

import argparse
import subprocess
import sys
import re
import time
from pathlib import Path
from datetime import datetime

PROJECT_DIR = Path(__file__).parent
TRAIN_FILE = PROJECT_DIR / "train.py"
RESULTS_FILE = PROJECT_DIR / "results.tsv"
METRIC_PATTERN = re.compile(r">>> val_sharpe ([-+]?\d+\.?\d*)")


def run_train():
    """Run train.py and capture output. Returns (val_sharpe, full_output) or (None, error)."""
    print("\n>>> Running train.py...")
    try:
        result = subprocess.run(
            [sys.executable, str(TRAIN_FILE)],
            capture_output=True,
            text=True,
            timeout=660,  # 11 min hard timeout
            cwd=str(PROJECT_DIR),
        )
        output = result.stdout + result.stderr
        print(output)

        match = METRIC_PATTERN.search(output)
        if match:
            val_sharpe = float(match.group(1))
            return val_sharpe, output
        else:
            print("ERROR: Could not parse val_sharpe from output")
            return None, output
    except subprocess.TimeoutExpired:
        print("ERROR: train.py timed out (>11 minutes)")
        return None, "TIMEOUT"
    except Exception as e:
        print(f"ERROR: {e}")
        return None, str(e)


def git_commit(message):
    """Commit train.py changes."""
    subprocess.run(["git", "add", str(TRAIN_FILE)], cwd=str(PROJECT_DIR))
    subprocess.run(["git", "commit", "-m", message], cwd=str(PROJECT_DIR))


def git_revert():
    """Revert train.py to last committed version."""
    subprocess.run(["git", "checkout", "--", str(TRAIN_FILE)], cwd=str(PROJECT_DIR))


def load_best_sharpe():
    """Load the best val_sharpe from results.tsv."""
    if not RESULTS_FILE.exists():
        return -float("inf")
    best = -float("inf")
    with open(RESULTS_FILE) as f:
        for line in f:
            parts = line.strip().split("\t")
            if len(parts) >= 3 and parts[2] != "val_sharpe":
                try:
                    val = float(parts[2])
                    if val > best:
                        best = val
                except ValueError:
                    pass
    return best


def log_result(experiment_name, val_sharpe, kept, notes=""):
    """Append result to results.tsv."""
    if not RESULTS_FILE.exists():
        with open(RESULTS_FILE, "w") as f:
            f.write("timestamp\texperiment\tval_sharpe\tkept\tnotes\n")
    with open(RESULTS_FILE, "a") as f:
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        sharpe_str = f"{val_sharpe:.4f}" if val_sharpe is not None else "FAILED"
        f.write(f"{ts}\t{experiment_name}\t{sharpe_str}\t{kept}\t{notes}\n")


def run_baseline():
    """Establish baseline performance."""
    print("=" * 60)
    print("ESTABLISHING BASELINE")
    print("=" * 60)

    val_sharpe, output = run_train()
    if val_sharpe is not None:
        log_result("baseline", val_sharpe, "YES", "Initial baseline")
        git_commit(f"baseline: val_sharpe={val_sharpe:.4f}")
        print(f"\nBaseline established: val_sharpe = {val_sharpe:.4f}")
    else:
        print("\nFailed to establish baseline. Fix train.py and try again.")
    return val_sharpe


def run_experiment(name="manual"):
    """
    Run a single experiment.
    Assumes train.py has been modified before calling this.
    """
    best_sharpe = load_best_sharpe()
    print(f"\nCurrent best val_sharpe: {best_sharpe:.4f}")

    val_sharpe, output = run_train()

    if val_sharpe is None:
        print("\nExperiment FAILED — reverting.")
        git_revert()
        log_result(name, None, "NO", "crashed/timeout")
        return None

    if val_sharpe > best_sharpe:
        print(f"\nIMPROVED! {best_sharpe:.4f} → {val_sharpe:.4f}")
        git_commit(f"{name}: val_sharpe={val_sharpe:.4f} (improved from {best_sharpe:.4f})")
        log_result(name, val_sharpe, "YES", f"improved from {best_sharpe:.4f}")
    else:
        print(f"\nNo improvement ({val_sharpe:.4f} <= {best_sharpe:.4f}) — reverting.")
        git_revert()
        log_result(name, val_sharpe, "NO", f"not better than {best_sharpe:.4f}")

    return val_sharpe


def main():
    parser = argparse.ArgumentParser(description="Autoresearch experiment runner")
    parser.add_argument("--baseline", action="store_true", help="Establish baseline")
    parser.add_argument("--auto", type=int, default=0,
                        help="Run N experiments automatically (requires Claude agent)")
    parser.add_argument("--name", type=str, default="manual",
                        help="Experiment name for logging")
    args = parser.parse_args()

    if args.baseline:
        run_baseline()
    elif args.auto > 0:
        print(f"\nRunning {args.auto} automated experiments.")
        print("NOTE: In auto mode, an AI agent should modify train.py between runs.")
        print("Without an agent, this just re-runs the same config.\n")
        for i in range(args.auto):
            print(f"\n{'='*60}")
            print(f"EXPERIMENT {i+1}/{args.auto}")
            print(f"{'='*60}")
            run_experiment(name=f"auto_{i+1}")
    else:
        run_experiment(name=args.name)


if __name__ == "__main__":
    main()
