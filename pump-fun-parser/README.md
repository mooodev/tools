# pump.fun Token Parser

Node.js application that parses tokens and their trading data from [pump.fun](https://pump.fun) and stores everything as local JSON files.

## Features

- **Historical mode**: Paginates through all existing tokens on pump.fun using multiple sort strategies (newest, oldest, highest market cap, graduated-only) to maximize coverage
- **Live mode**: Streams new tokens in real-time via the free PumpPortal WebSocket API
- **Full trade history**: Fetches all trades (buys/sells) for each token
- **Graduation tracking**: Records whether each token has graduated (completed bonding curve)
- **Resumable**: Saves crawler state so you can stop and resume without re-fetching
- **Rate-limited**: Built-in request throttling and exponential backoff retries

## Data Collected Per Token

Each token JSON file includes:

| Field | Description |
|---|---|
| `mint` | Token contract address (Solana) |
| `name` / `symbol` | Token name and ticker symbol |
| `description` | Token description |
| `image_uri` / `metadata_uri` | Token image and metadata URLs |
| `twitter` / `telegram` / `website` | Social links |
| `creator` | Wallet address of the token creator |
| `created_timestamp` | When the token was created |
| `bonding_curve` | Bonding curve contract address |
| `virtual_sol_reserves` / `virtual_token_reserves` | Current bonding curve reserves |
| `total_supply` | Total token supply |
| `market_cap` / `usd_market_cap` | Market capitalization |
| `graduated` | `true` if the bonding curve completed and token migrated to DEX |
| `raydium_pool` | Raydium pool address (if graduated) |
| `trades` | Array of ALL buy/sell trades with amounts, timestamps, signatures (requires JWT) |
| `trades_count` | Total number of trades |
| `candlesticks` | OHLCV price/volume history (works without JWT) |
| `candlesticks_count` | Number of candlestick bars |
| `raw_coin_data` | Complete raw API response for the token |

## Setup

```bash
cd pump-fun-parser
npm install
```

## Usage

### Historical Mode (default)

Paginate through existing tokens and fetch all their trades:

```bash
npm start
# or
node src/index.js historical
```

### Live Mode

Stream new tokens in real-time as they're created:

```bash
node src/index.js live
# or
npm run fetch-live
```

### Both Modes

Run historical fetch first, then switch to live streaming:

```bash
node src/index.js both
```

### Check Status

See a summary of all collected data:

```bash
npm run status
```

## Authentication

The pump.fun **trades endpoint** (`/trades/all/{mint}`) requires JWT authentication. Without it, the parser still collects token metadata, graduation status, and candlestick (OHLCV) price/volume data — but individual trade records will be empty.

### How to get your JWT token

1. Go to [pump.fun](https://pump.fun) in your browser
2. Open DevTools (F12) > **Network** tab
3. Click on any token page and look for requests to `frontend-api-v3.pump.fun`
4. Find the `Authorization: Bearer eyJ...` header value and copy the token part
5. Set it as an environment variable:

```bash
export PUMPFUN_JWT="eyJhbGciOiJIUzI1NiIs..."
node src/index.js historical
```

### What you get with vs. without JWT

| Data | Without JWT | With JWT |
|---|---|---|
| Token metadata (name, symbol, creator, etc.) | Yes | Yes |
| Graduation status | Yes | Yes |
| Bonding curve data | Yes | Yes |
| Candlestick / OHLCV data | Yes | Yes |
| Individual trades (buy/sell records) | **No** | Yes |
| Advanced metadata | No | Yes |

## Output

Token data is saved as individual JSON files in `data/tokens/`:

```
data/
  tokens/
    7vJY...pump.json    # One file per token (named by mint address)
    AbCd...1234.json
    ...
  state.json            # Crawler state for resumption
```

## Configuration

Edit `src/config.js` to adjust:

- `REQUEST_DELAY_MS` — Delay between API requests (default: 3000ms)
- `COINS_PER_PAGE` — Coins per pagination page (default: 50)
- `TRADES_PER_PAGE` — Trades per pagination page (default: 200)
- `MAX_TRADE_PAGES` — Max trade pages per token (default: 50 = up to 10,000 trades)

## API Sources

- **pump.fun Frontend API** (`frontend-api-v3.pump.fun`) — Token listings, trades, metadata
- **pump.fun Advanced API** (`advanced-api-v2.pump.fun`) — Combined metadata + trades
- **PumpPortal WebSocket** (`pumpportal.fun`) — Free real-time new token and trade streaming
