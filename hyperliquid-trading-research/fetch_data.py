#!/usr/bin/env python3
"""
Data fetcher for Hyperliquid trading research.

Wraps the existing hyperliquid-candles fetcher to download multi-timeframe
candle data. Ensures BTC is always included (required as market leader).

Usage:
    python fetch_data.py                # fetch top 50 coins
    python fetch_data.py --coins 20     # fetch top 20 coins
    python fetch_data.py --days 60      # fetch 60 days of history
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Add parent directory for hyperliquid-candles imports
CANDLES_DIR = Path(__file__).parent.parent / "hyperliquid-candles"
sys.path.insert(0, str(CANDLES_DIR))

from fetch_candles import api_post, fetch_candles, get_top_coins, rate_limiter
from add_indicators import add_indicators

BASE_DIR = CANDLES_DIR
BTC_SYMBOL = "BTC"

TIMEFRAMES = [
    ("15m", "15mdata"),
    ("1h", "1hdata"),
    ("4h", "4hdata"),
]


def ensure_btc_included(coins):
    """Ensure BTC is in the coin list (required for leader analysis)."""
    if BTC_SYMBOL not in coins:
        coins.insert(0, BTC_SYMBOL)
        print(f"Added {BTC_SYMBOL} to coin list (required as market leader)")
    return coins


def download_timeframe(coins, interval, folder, start_ms, end_ms):
    """Download candles + indicators for one timeframe across all coins."""
    output_dir = os.path.join(str(BASE_DIR), folder)
    os.makedirs(output_dir, exist_ok=True)

    print(f"\n{'='*60}")
    print(f"  Timeframe: {interval}  ->  {folder}/")
    print(f"{'='*60}")

    for i, coin in enumerate(coins, 1):
        out_path = os.path.join(output_dir, f"{coin}.json")

        # Skip if recently fetched (within last hour)
        if os.path.exists(out_path):
            mtime = os.path.getmtime(out_path)
            age_hours = (time.time() - mtime) / 3600
            if age_hours < 1:
                with open(out_path) as f:
                    existing = json.load(f)
                print(f"  [{i}/{len(coins)}] {coin} ({interval}): "
                      f"cached ({len(existing)} candles, {age_hours:.1f}h old)")
                continue

        print(f"  [{i}/{len(coins)}] {coin} ({interval})...", end=" ", flush=True)
        candles = fetch_candles(coin, interval, start_ms, end_ms)
        candles = add_indicators(candles)

        with open(out_path, "w") as f:
            json.dump(candles, f, indent=2)

        print(f"{len(candles)} candles")

    print(f"  Done: {folder}/ complete")


def main():
    parser = argparse.ArgumentParser(description="Fetch Hyperliquid candle data")
    parser.add_argument("--coins", type=int, default=50,
                        help="Number of top coins to fetch (default: 50)")
    parser.add_argument("--days", type=int, default=30,
                        help="Days of history to fetch (default: 30)")
    args = parser.parse_args()

    now = datetime.now(timezone.utc)
    end_ms = int(now.timestamp() * 1000)
    start_ms = int((now - timedelta(days=args.days)).timestamp() * 1000)

    print(f"Fetching top {args.coins} coins by 24h volume...")
    print(f"Date range: {now - timedelta(days=args.days):%Y-%m-%d} to {now:%Y-%m-%d}")
    print(f"Fee model: 0.05% per side (0.10% round trip)")

    coins = get_top_coins(args.coins)
    coins = ensure_btc_included(coins)
    print(f"Coins ({len(coins)}): {', '.join(coins)}")

    for interval, folder in TIMEFRAMES:
        download_timeframe(coins, interval, folder, start_ms, end_ms)

    print(f"\nAll done! Data saved to: "
          + ", ".join(f"{BASE_DIR}/{f}/" for _, f in TIMEFRAMES))
    print(f"\nNext step: python train.py")


if __name__ == "__main__":
    main()
