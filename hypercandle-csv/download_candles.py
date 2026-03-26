#!/usr/bin/env python3
"""
HypercandleDownloader — Downloads the latest month of 1m, 15m, 1h, and 4h
candlestick data for the top 50 coins from Hyperliquid and saves as CSV.

CSV format: timestamp,open,high,low,close,volume,amount

Output folders: 1mdata/, 15mdata/, 1hdata/, 4hdata/
"""

import csv
import os
import time
from datetime import datetime, timedelta, timezone

import requests

API_URL = "https://api.hyperliquid.xyz/info"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TOP_N = 50
CANDLES_PER_REQUEST = 500

TIMEFRAMES = [
    ("1m", "1mdata"),
    ("15m", "15mdata"),
    ("1h", "1hdata"),
    ("4h", "4hdata"),
]

# --- Rate limiter -----------------------------------------------------------

RATE_LIMIT_WEIGHT_PER_MIN = 1200
WEIGHT_PER_REQUEST = 20
MAX_RETRIES = 4
INITIAL_BACKOFF = 2.0


class RateLimiter:
    """Sliding-window rate limiter tracking request weight over 60s."""

    def __init__(self, max_weight=RATE_LIMIT_WEIGHT_PER_MIN, window=60.0):
        self.max_weight = max_weight
        self.window = window
        self.requests = []

    def _prune(self):
        cutoff = time.monotonic() - self.window
        self.requests = [(t, w) for t, w in self.requests if t > cutoff]

    def wait_if_needed(self, weight=WEIGHT_PER_REQUEST):
        while True:
            self._prune()
            used = sum(w for _, w in self.requests)
            if used + weight <= self.max_weight:
                break
            oldest = self.requests[0][0]
            sleep_for = (oldest + self.window) - time.monotonic() + 0.1
            if sleep_for > 0:
                print(f"    Rate limit: waiting {sleep_for:.1f}s...")
                time.sleep(sleep_for)

    def record(self, weight=WEIGHT_PER_REQUEST):
        self.requests.append((time.monotonic(), weight))


rate_limiter = RateLimiter()


def api_post(payload, timeout=30):
    """POST to Hyperliquid API with rate limiting and retries."""
    rate_limiter.wait_if_needed()
    backoff = INITIAL_BACKOFF
    last_exc = None

    for attempt in range(MAX_RETRIES + 1):
        try:
            resp = requests.post(API_URL, json=payload, timeout=timeout)
            if resp.status_code == 429:
                retry_after = float(resp.headers.get("Retry-After", backoff))
                print(f"    429 rate limited, backing off {retry_after:.1f}s "
                      f"(attempt {attempt + 1}/{MAX_RETRIES + 1})")
                time.sleep(retry_after)
                backoff *= 2
                continue
            if resp.status_code >= 500:
                print(f"    Server error {resp.status_code}, backing off {backoff:.1f}s "
                      f"(attempt {attempt + 1}/{MAX_RETRIES + 1})")
                time.sleep(backoff)
                backoff *= 2
                continue
            resp.raise_for_status()
            rate_limiter.record()
            return resp
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as e:
            last_exc = e
            print(f"    Connection error, backing off {backoff:.1f}s "
                  f"(attempt {attempt + 1}/{MAX_RETRIES + 1})")
            time.sleep(backoff)
            backoff *= 2

    raise requests.exceptions.RequestException(
        f"Failed after {MAX_RETRIES + 1} attempts"
    ) from last_exc


# --- Data fetching -----------------------------------------------------------


def get_top_coins(n):
    """Fetch market metadata and return top N coins by 24h volume."""
    resp = api_post({"type": "metaAndAssetCtxs"})
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


def fetch_candles(coin, interval, start_ms, end_ms):
    """Fetch all candles for a coin/interval, paginating as needed."""
    all_candles = []
    cursor = start_ms

    while cursor < end_ms:
        resp = api_post({
            "type": "candleSnapshot",
            "req": {
                "coin": coin,
                "interval": interval,
                "startTime": cursor,
                "endTime": end_ms,
            },
        })
        candles = resp.json()
        if not candles:
            break

        all_candles.extend(candles)
        last_close = candles[-1]["T"]
        if last_close <= cursor:
            break
        cursor = last_close + 1

        if len(candles) < CANDLES_PER_REQUEST:
            break

    return all_candles


def candles_to_csv(candles, filepath):
    """Write candles to CSV: timestamp,open,high,low,close,volume,amount."""
    with open(filepath, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["timestamp", "open", "high", "low", "close", "volume", "amount"])
        for c in candles:
            ts = datetime.fromtimestamp(c["t"] / 1000, tz=timezone.utc).strftime(
                "%Y-%m-%d %H:%M:%S"
            )
            writer.writerow([
                ts,
                c["o"],
                c["h"],
                c["l"],
                c["c"],
                c["v"],
                c["v"],  # amount = notional volume (same as volume from HL)
            ])


def download_timeframe(coins, interval, folder, start_ms, end_ms):
    """Download candles for one timeframe across all coins, save as CSV."""
    output_dir = os.path.join(BASE_DIR, folder)
    os.makedirs(output_dir, exist_ok=True)

    print(f"\n{'=' * 60}")
    print(f"  Timeframe: {interval}  ->  {folder}/")
    print(f"{'=' * 60}")

    for i, coin in enumerate(coins, 1):
        print(f"  [{i}/{len(coins)}] {coin} ({interval})...", end=" ", flush=True)
        candles = fetch_candles(coin, interval, start_ms, end_ms)

        out_path = os.path.join(output_dir, f"{coin}.csv")
        candles_to_csv(candles, out_path)
        print(f"{len(candles)} candles -> {coin}.csv")

    print(f"  Done: {folder}/ complete")


def main():
    now = datetime.now(timezone.utc)
    end_ms = int(now.timestamp() * 1000)
    start_ms = int((now - timedelta(days=30)).timestamp() * 1000)

    print("=" * 60)
    print("  HypercandleDownloader - CSV Candle Exporter")
    print("=" * 60)
    print(f"Date range: {now - timedelta(days=30):%Y-%m-%d %H:%M} to {now:%Y-%m-%d %H:%M} UTC")

    print(f"\nFetching top {TOP_N} coins by 24h volume...")
    coins = get_top_coins(TOP_N)
    print(f"Top {TOP_N}: {', '.join(coins)}")

    for interval, folder in TIMEFRAMES:
        download_timeframe(coins, interval, folder, start_ms, end_ms)

    print(f"\nAll done! CSV data saved to:")
    for interval, folder in TIMEFRAMES:
        print(f"  {folder}/  ({interval} candles)")


if __name__ == "__main__":
    main()
