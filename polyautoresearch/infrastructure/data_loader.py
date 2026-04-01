"""
Data loader for 15m prediction market orderbook snapshots.

Each JSON file represents one 15-minute game/play containing an array of
orderbook snapshots with timestamp, side (YES/NO), topBid, and topAsk.

READ-ONLY: Do not modify this file. Only train.py is editable.
"""

import json
import os
import glob
from datetime import datetime
from typing import Optional


def load_block(filepath: str) -> list[dict]:
    """Load a single 15m block JSON file."""
    with open(filepath, "r") as f:
        raw = json.load(f)

    records = []
    for entry in raw:
        ts = datetime.fromisoformat(entry["timestamp"].replace("Z", "+00:00"))
        records.append({
            "timestamp": ts,
            "epoch": ts.timestamp(),
            "side": entry["side"],
            "topBid": float(entry["topBid"]),
            "topAsk": float(entry["topAsk"]),
        })
    return records


def extract_yes_series(block: list[dict]) -> list[dict]:
    """Extract only YES-side entries from a block, sorted by time."""
    yes_entries = [r for r in block if r["side"] == "YES"]
    yes_entries.sort(key=lambda x: x["epoch"])
    return yes_entries


def extract_no_series(block: list[dict]) -> list[dict]:
    """Extract only NO-side entries from a block, sorted by time."""
    no_entries = [r for r in block if r["side"] == "NO"]
    no_entries.sort(key=lambda x: x["epoch"])
    return no_entries


def load_all_blocks(data_dir: str = "data") -> list[dict]:
    """
    Load all 15m blocks from the data directory.

    Returns list of dicts, each containing:
      - filepath: str
      - block_index: int (chronological order)
      - start_time: datetime
      - end_time: datetime
      - duration_sec: float
      - raw: list[dict] (all entries)
      - yes: list[dict] (YES-side only)
      - no: list[dict] (NO-side only)
    """
    pattern = os.path.join(data_dir, "*.json")
    files = sorted(glob.glob(pattern))

    if not files:
        raise FileNotFoundError(
            f"No JSON files found in {data_dir}/. "
            "Place your 15m block JSON files there."
        )

    blocks = []
    for filepath in files:
        raw = load_block(filepath)
        if not raw:
            continue

        yes = extract_yes_series(raw)
        no = extract_no_series(raw)

        if not yes:
            continue

        blocks.append({
            "filepath": filepath,
            "raw": raw,
            "yes": yes,
            "no": no,
            "start_time": yes[0]["timestamp"],
            "end_time": yes[-1]["timestamp"],
            "duration_sec": yes[-1]["epoch"] - yes[0]["epoch"],
        })

    # Sort blocks chronologically
    blocks.sort(key=lambda b: b["start_time"])
    for i, b in enumerate(blocks):
        b["block_index"] = i

    return blocks


def get_block_elapsed_seconds(yes_entry: dict, block_start_epoch: float) -> float:
    """Get seconds elapsed since block start for a YES entry."""
    return yes_entry["epoch"] - block_start_epoch


def split_train_test(
    blocks: list[dict],
    test_ratio: float = 0.2,
    min_test: int = 1
) -> tuple[list[dict], list[dict]]:
    """
    Split blocks into train and test sets chronologically.
    Later blocks are used for testing (no data leakage).
    """
    n = len(blocks)
    n_test = max(min_test, int(n * test_ratio))
    n_train = n - n_test
    return blocks[:n_train], blocks[n_train:]
