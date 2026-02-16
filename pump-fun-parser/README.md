# pump.fun Graduated Token Parser

Node.js application that parses **graduated tokens** from [pump.fun](https://pump.fun) and fetches their OHLCV candlestick data via the free [GeckoTerminal](https://www.geckoterminal.com/) API. All data is stored as local JSON files.

## Features

- **Graduated tokens only**: Fetches only tokens that have completed their bonding curve and migrated to a DEX
- **Candlestick data**: Fetches full OHLCV price/volume history from GeckoTerminal (free, no API key needed)
- **Multiple sort strategies**: Covers tokens by market cap (high/low) and creation time (newest/oldest)
- **Resumable**: Saves crawler state so you can stop and resume without re-fetching
- **Rate-limited**: Built-in request throttling and exponential backoff retries

## Data Collected

### Token metadata (`data/tokens/<mint>.json`)

| Field | Description |
|---|---|
| `mint` | Token contract address (Solana) |
| `name` / `symbol` | Token name and ticker symbol |
| `creator` | Wallet address of the token creator |
| `market_cap` / `usd_market_cap` | Market capitalization |
| `graduated` | Always `true` (only graduated tokens are collected) |
| `raydium_pool` | Raydium/PumpSwap pool address |

### Candlestick data (`data/candles/<mint>.json`)

| Field | Description |
|---|---|
| `meta` | Token address, pool address, timeframe, date range |
| `candles` | Array of OHLCV bars: `timestamp`, `open`, `high`, `low`, `close`, `volume` |

## Setup

```bash
cd pump-fun-parser
npm install
```

No API keys or authentication needed.

## Usage

```bash
npm start
```

## Output

```
data/
  tokens/
    7vJY...pump.json    # Token metadata (one file per graduated token)
    AbCd...1234.json
  candles/
    7vJY...pump.json    # OHLCV candlestick data (one file per token)
    AbCd...1234.json
  state.json            # Crawler state for resumption
```

## Configuration

Edit `src/config.js` to adjust:

- `REQUEST_DELAY_MS` — Delay between pump.fun API requests (default: 3000ms)
- `GECKO_RATE_LIMIT_MS` — Delay between GeckoTerminal API requests (default: 1200ms)
- `COINS_PER_PAGE` — Coins per pagination page (default: 50)
- `DEFAULT_TIMEFRAME` — Candle timeframe: `hour`, `day`, or `minute` (default: `hour`)
- `DEFAULT_AGGREGATE` — Aggregation period (default: `1`)

## API Sources

- **pump.fun Frontend API** (`frontend-api-v3.pump.fun`) — Graduated token listings
- **GeckoTerminal API** (`api.geckoterminal.com`) — Free OHLCV candlestick data (no key needed)
