#!/usr/bin/env python3
"""
Generate sample 15m block data for testing the polyautoresearch system.

Creates realistic-looking orderbook snapshots with price movements
that simulate a prediction market (YES/NO sides).

Usage:
    python generate_sample_data.py          # Generate 20 blocks
    python generate_sample_data.py --n 50   # Generate 50 blocks
"""

import json
import os
import argparse
import random
from datetime import datetime, timedelta, timezone


def generate_block(start_time: datetime, block_id: int) -> list[dict]:
    """Generate one 15m block of orderbook snapshots."""
    entries = []

    # Starting prices (YES side)
    yes_bid = round(random.uniform(0.30, 0.70), 2)
    yes_ask = round(yes_bid + random.choice([0.01, 0.01, 0.02]), 2)

    # Price drift parameters for this block
    drift = random.gauss(0, 0.0005)  # slight random drift per tick
    volatility = random.uniform(0.005, 0.02)

    current_time = start_time
    block_end = start_time + timedelta(minutes=15)

    tick_interval = random.uniform(4, 6)  # seconds between ticks

    while current_time < block_end:
        # Random price movement
        price_change = random.gauss(drift, volatility)
        yes_bid = round(max(0.01, min(0.99, yes_bid + price_change)), 2)
        yes_ask = round(yes_bid + random.choice([0.01, 0.01, 0.02]), 2)
        yes_ask = min(0.99, yes_ask)

        no_bid = round(max(0.01, 1.0 - yes_ask - random.uniform(0, 0.01)), 2)
        no_ask = round(no_bid + random.choice([0.01, 0.01, 0.02]), 2)
        no_ask = min(0.99, no_ask)

        ts = current_time.isoformat().replace("+00:00", "Z")

        # YES entry
        entries.append({
            "timestamp": ts,
            "side": "YES",
            "topBid": f"{yes_bid:.2f}",
            "topAsk": f"{yes_ask:.2f}",
        })

        # NO entry (slightly later)
        no_time = current_time + timedelta(milliseconds=random.randint(100, 300))
        entries.append({
            "timestamp": no_time.isoformat().replace("+00:00", "Z"),
            "side": "NO",
            "topBid": f"{no_bid:.2f}",
            "topAsk": f"{no_ask:.2f}",
        })

        current_time += timedelta(seconds=tick_interval + random.uniform(-1, 1))

    return entries


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--n", type=int, default=20, help="Number of 15m blocks to generate")
    parser.add_argument("--output", type=str, default="data", help="Output directory")
    args = parser.parse_args()

    os.makedirs(args.output, exist_ok=True)

    start = datetime(2026, 4, 1, 8, 0, 0, tzinfo=timezone.utc)

    for i in range(args.n):
        block_start = start + timedelta(minutes=15 * i)
        entries = generate_block(block_start, i)

        filename = f"block_{i:04d}.json"
        filepath = os.path.join(args.output, filename)

        with open(filepath, "w") as f:
            json.dump(entries, f, indent=2)

        print(f"Generated {filepath} ({len(entries)} entries)")

    print(f"\nGenerated {args.n} blocks in {args.output}/")


if __name__ == "__main__":
    main()
