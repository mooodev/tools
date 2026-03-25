#!/usr/bin/env python3
"""
Downloads the latest month of candlestick data for the top 50 coins
from Hyperliquid across multiple timeframes (15m, 1h, 4h) and stores
them as JSON files with technical indicators.

Rate limiting strategy:
  - Tracks request weight budget (1200/min as per Hyperliquid docs)
  - Adaptive delay between requests based on remaining budget
  - Exponential backoff on 429/5xx errors (up to 4 retries)
  - Cooldown period when approaching rate limit ceiling
"""

import json
import os
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone

try:
    import requests
except ModuleNotFoundError:
    print("Installing requests...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "requests"])
    import requests

from add_indicators import add_indicators

API_URL = "https://api.hyperliquid.xyz/info"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TOP_N = 50
CANDLES_PER_REQUEST = 500

# Timeframe configs: (interval, output_folder)
TIMEFRAMES = [
    ("15m", "15mdata"),
    ("1h", "1hdata"),
    ("4h", "4hdata"),
]

# --- Rate limiter -----------------------------------------------------------

RATE_LIMIT_WEIGHT_PER_MIN = 1200
WEIGHT_PER_REQUEST = 20  # info endpoint weight
MAX_RETRIES = 4
INITIAL_BACKOFF = 2.0  # seconds


class RateLimiter:
    """Sliding-window rate limiter that tracks request weight over 60s."""

    def __init__(self, max_weight: int = RATE_LIMIT_WEIGHT_PER_MIN, window: float = 60.0):
        self.max_weight = max_weight
        self.window = window
        self.requests: list[tuple[float, int]] = []  # (timestamp, weight)

    def _prune(self):
        cutoff = time.monotonic() - self.window
        self.requests = [(t, w) for t, w in self.requests if t > cutoff]

    def current_weight(self) -> int:
        self._prune()
        return sum(w for _, w in self.requests)

    def wait_if_needed(self, weight: int = WEIGHT_PER_REQUEST):
        """Block until there is enough budget for the next request."""
        while True:
            self._prune()
            used = sum(w for _, w in self.requests)
            if used + weight <= self.max_weight:
                break
            # Wait until the oldest request falls out of the window
            oldest = self.requests[0][0]
            sleep_for = (oldest + self.window) - time.monotonic() + 0.1
            if sleep_for > 0:
                print(f"    Rate limit: waiting {sleep_for:.1f}s for budget...")
                time.sleep(sleep_for)

    def record(self, weight: int = WEIGHT_PER_REQUEST):
        self.requests.append((time.monotonic(), weight))


rate_limiter = RateLimiter()


def api_post(payload: dict, timeout: int = 30) -> requests.Response:
    """POST to Hyperliquid API with rate limiting and retry on errors."""
    rate_limiter.wait_if_needed()

    backoff = INITIAL_BACKOFF
    last_exc = None

    for attempt in range(MAX_RETRIES + 1):
        try:
            resp = requests.post(API_URL, json=payload, timeout=timeout)

            if resp.status_code == 429:
                retry_after = float(resp.headers.get("Retry-After", backoff))
                print(f"    429 rate limited, backing off {retry_after:.1f}s (attempt {attempt + 1}/{MAX_RETRIES + 1})")
                time.sleep(retry_after)
                backoff *= 2
                continue

            if resp.status_code >= 500:
                print(f"    Server error {resp.status_code}, backing off {backoff:.1f}s (attempt {attempt + 1}/{MAX_RETRIES + 1})")
                time.sleep(backoff)
                backoff *= 2
                continue

            resp.raise_for_status()
            rate_limiter.record()
            return resp

        except requests.exceptions.ConnectionError as e:
            last_exc = e
            print(f"    Connection error, backing off {backoff:.1f}s (attempt {attempt + 1}/{MAX_RETRIES + 1})")
            time.sleep(backoff)
            backoff *= 2

        except requests.exceptions.Timeout as e:
            last_exc = e
            print(f"    Timeout, backing off {backoff:.1f}s (attempt {attempt + 1}/{MAX_RETRIES + 1})")
            time.sleep(backoff)
            backoff *= 2

    raise requests.exceptions.RequestException(
        f"Failed after {MAX_RETRIES + 1} attempts"
    ) from last_exc


# --- Data fetching -----------------------------------------------------------


def get_top_coins(n: int) -> list[str]:
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


def fetch_candles(coin: str, interval: str, start_ms: int, end_ms: int) -> list[dict]:
    """Fetch all candles for a coin/interval between start_ms and end_ms, paginating as needed."""
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


def download_timeframe(coins: list[str], interval: str, folder: str, start_ms: int, end_ms: int):
    """Download candles + add indicators for one timeframe across all coins."""
    output_dir = os.path.join(BASE_DIR, folder)
    os.makedirs(output_dir, exist_ok=True)

    print(f"\n{'='*60}")
    print(f"  Timeframe: {interval}  ->  {folder}/")
    print(f"{'='*60}")

    for i, coin in enumerate(coins, 1):
        print(f"  [{i}/{len(coins)}] {coin} ({interval})...", end=" ", flush=True)
        candles = fetch_candles(coin, interval, start_ms, end_ms)
        candles = add_indicators(candles)

        out_path = os.path.join(output_dir, f"{coin}.json")
        with open(out_path, "w") as f:
            json.dump(candles, f, indent=2)

        print(f"{len(candles)} candles")

    print(f"  Done: {folder}/ complete")


def main():
    now = datetime.now(timezone.utc)
    end_ms = int(now.timestamp() * 1000)
    start_ms = int((now - timedelta(days=30)).timestamp() * 1000)

    print(f"Fetching top {TOP_N} coins by 24h volume...")
    coins = get_top_coins(TOP_N)
    print(f"Top {TOP_N}: {', '.join(coins)}")

    for interval, folder in TIMEFRAMES:
        download_timeframe(coins, interval, folder, start_ms, end_ms)

    print(f"\nAll done! Data with indicators saved to: "
          + ", ".join(f"{f}/" for _, f in TIMEFRAMES))


if __name__ == "__main__":
    main()
