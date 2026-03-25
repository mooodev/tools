#!/usr/bin/env python3
"""
Downloads the latest month of 1h candlestick data for the top 50 coins
from Hyperliquid and stores them as JSON files in the 1hdata/ folder.
"""

import json
import os
import time
from datetime import datetime, timedelta, timezone

import requests

from add_indicators import add_indicators

API_URL = "https://api.hyperliquid.xyz/info"
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "1hdata")
TOP_N = 50
INTERVAL = "1h"
CANDLES_PER_REQUEST = 500
REQUEST_DELAY = 0.15  # seconds between requests to respect rate limits


def get_top_coins(n: int) -> list[str]:
    """Fetch market metadata and return top N coins by 24h volume."""
    resp = requests.post(API_URL, json={"type": "metaAndAssetCtxs"}, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    universe = data[0]["universe"]
    asset_ctxs = data[1]

    coins = []
    for meta, ctx in zip(universe, asset_ctxs):
        if meta.get("isDelisted"):
            continue
        volume = float(ctx.get("dayNtlVlm", 0))
        coins.append((meta["name"], volume))

    coins.sort(key=lambda x: x[1], reverse=True)
    return [name for name, _ in coins[:n]]


def fetch_candles(coin: str, start_ms: int, end_ms: int) -> list[dict]:
    """Fetch all 1h candles for a coin between start_ms and end_ms, paginating as needed."""
    all_candles = []
    cursor = start_ms

    while cursor < end_ms:
        resp = requests.post(
            API_URL,
            json={
                "type": "candleSnapshot",
                "req": {
                    "coin": coin,
                    "interval": INTERVAL,
                    "startTime": cursor,
                    "endTime": end_ms,
                },
            },
            timeout=30,
        )
        resp.raise_for_status()
        candles = resp.json()

        if not candles:
            break

        all_candles.extend(candles)

        # Use the close time of the last candle + 1ms as next cursor
        last_close = candles[-1]["T"]
        if last_close <= cursor:
            break
        cursor = last_close + 1

        if len(candles) < CANDLES_PER_REQUEST:
            break

        time.sleep(REQUEST_DELAY)

    return all_candles


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    now = datetime.now(timezone.utc)
    end_ms = int(now.timestamp() * 1000)
    start_ms = int((now - timedelta(days=30)).timestamp() * 1000)

    print(f"Fetching top {TOP_N} coins by 24h volume...")
    coins = get_top_coins(TOP_N)
    print(f"Top {TOP_N} coins: {', '.join(coins)}")

    for i, coin in enumerate(coins, 1):
        print(f"[{i}/{TOP_N}] Fetching 1h candles for {coin}...")
        candles = fetch_candles(coin, start_ms, end_ms)
        print(f"  Got {len(candles)} candles")

        print(f"  Adding indicators...")
        candles = add_indicators(candles)

        out_path = os.path.join(OUTPUT_DIR, f"{coin}.json")
        with open(out_path, "w") as f:
            json.dump(candles, f, indent=2)

        time.sleep(REQUEST_DELAY)

    print(f"\nDone! Data with indicators saved to {OUTPUT_DIR}/")


if __name__ == "__main__":
    main()
