# Hyperliquid Alt Trading Research

Autoresearch-based trading model for Hyperliquid altcoin trading using
multi-timeframe candle data with BTC as market leader.

## Architecture

```
                    ┌──────────────┐
                    │  fetch_data  │  Hyperliquid API → JSON candles
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
          ┌───┴──┐    ┌───┴──┐    ┌───┴──┐
          │ 15m  │    │  1h  │    │  4h  │   Per-coin candle files
          └───┬──┘    └───┬──┘    └───┬──┘
              │           │           │
              └─────┬─────┴─────┬─────┘
                    │           │
              ┌─────┴───┐  ┌───┴─────┐
              │ Altcoin  │  │   BTC   │   BTC as leader signal
              │ features │  │ features│
              └─────┬────┘  └───┬─────┘
                    └─────┬─────┘
                          │
                   ┌──────┴──────┐
                   │  46 unified │   Multi-timeframe feature matrix
                   │  features   │
                   └──────┬──────┘
                          │
                   ┌──────┴──────┐
                   │   train.py  │   LightGBM model (autoresearch target)
                   │  (mutable)  │
                   └──────┬──────┘
                          │
                   ┌──────┴──────┐
                   │  Trading    │   With 0.05% fees per side
                   │  Simulation │
                   └─────────────┘
```

## Features (46 per timestamp)

| Group | Count | Description |
|-------|-------|-------------|
| Alt 1h | 20 | OHLCV, RSI, MACD, BB, ATR, ADX, Stoch, CCI, Williams, SMA/EMA ratios |
| Alt 15m | 7 | Intra-hour momentum, volatility, volume trend, micro indicators |
| Alt 4h | 7 | Higher-timeframe trend, range, RSI, MACD, BB, ADX |
| BTC 1h | 7 | BTC return, RSI, MACD, BB, volume, ADX, ATR |
| BTC 4h | 3 | BTC 4h return, RSI, trend direction |
| Cross | 2 | BTC-alt return differential, rolling correlation |

## Fee Model

- **0.05% per trade** (buy side)
- **0.05% per trade** (sell side)
- **0.10% round trip** total
- All Sharpe ratios and returns are net of fees

## Quick Start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Fetch candle data (requires hyperliquid-candles)
python fetch_data.py

# 3. Establish baseline
python run.py --baseline

# 4. Run experiments (modify train.py, then run)
python run.py --name "my_experiment"
```

## Autoresearch Protocol

See [program.md](program.md) for the full experiment protocol.

The autoresearch loop:
1. Read current `train.py` and `results.tsv`
2. Hypothesize a change to improve Sharpe ratio
3. Edit `train.py`
4. Run experiment — automatically kept if improved, reverted if not
5. Repeat

## Timeframe Experiments

The system runs experiments across multiple forecast horizons:
- **1h ahead**: Short-term scalping
- **4h ahead**: Medium-term swing trades
- **12h ahead**: Swing trading
- **24h ahead**: Daily position trades

With varying lookback windows (12h, 24h, 48h) to find optimal combinations.
