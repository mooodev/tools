# Pump.fun MLX Trading Bot

An autoresearch-style ML trading system for pump.fun tokens, optimized for
Apple Silicon via [MLX](https://github.com/ml-explore/mlx). Inspired by
[autoresearch-mlx](https://github.com/trevin-creator/autoresearch-mlx).

The system trains a small transformer model on hourly candle data to learn
profitable long entries. An iterative experiment loop automatically tunes
the model by modifying `train.py`, evaluating Sharpe ratio, and keeping or
reverting changes via git.

## Quick Start

### 1. Install Python Dependencies

```bash
# Using pip
pip install mlx numpy

# Or using uv
uv pip install mlx numpy
```

> Requires macOS with Apple Silicon (M1/M2/M3/M4). MLX does not run on Intel Macs or Linux.

### 2. Add Candle Data

Place one or more pump.fun token candle JSON files in the `data/` directory:

```bash
cp your_token_candles.json ml-trading-bot-pump/data/
```

Each file must follow this format:

```json
{
  "meta": {
    "tokenAddress": "...",
    "tokenName": "Central African Republic Meme",
    "timeframe": "hour",
    "aggregate": 1,
    "currency": "usd",
    "totalCandles": 701
  },
  "candles": [
    {
      "timestamp": 1766426400,
      "datetime": "2025-12-22T18:00:00.000Z",
      "open": 0.00375,
      "high": 0.00375,
      "low": 0.00372,
      "close": 0.00372,
      "volume": 208.07
    }
  ]
}
```

You can add multiple token files — they'll all be used for training. Minimum
50 candles per file.

### 3. Establish Baseline

```bash
cd ml-trading-bot-pump
python run.py --baseline
```

This trains the default model config for 5 minutes and records the baseline
Sharpe ratio.

### 4. Run Experiments

**Manual mode** — edit `train.py`, then run:
```bash
python run.py --name "bigger_hidden_dim"
```
If it improves Sharpe, the change is committed. If not, it's reverted.

**Direct training** (without the experiment runner):
```bash
python train.py
```

### 5. Launch the Dashboard

```bash
cd dashboard
npm install
npm start
```

Open **http://localhost:3456** in your browser.

From the dashboard you can:
- **Start/Stop** training with mode selection (Baseline, Experiment, Auto)
- Watch **live charts**: training loss, Sharpe ratio, win rate, cumulative returns
- See **real-time stats**: current Sharpe, total return, win rate, trade count, max drawdown
- Review **experiment history** with kept/reverted status
- Monitor **training log** output in real time

## Project Structure

```
ml-trading-bot-pump/
├── data/                    # Put your candle JSON files here
│   └── .gitkeep
├── dashboard/               # Node.js monitoring dashboard
│   ├── package.json
│   ├── server.js            # Express + WebSocket server
│   └── public/
│       └── index.html       # Dashboard UI with Chart.js
├── prepare.py               # Data loading, 34 technical indicators (STATIC)
├── train.py                 # Model + training loop (MUTABLE by autoresearch)
├── run.py                   # Git-based experiment runner
├── program.md               # Experiment protocol
├── requirements.txt         # Python dependencies
└── README.md                # This file
```

## Technical Indicators (34 Features)

The `prepare.py` module computes 34 features per candle:

| # | Feature | Description |
|---|---------|-------------|
| 0 | log_return | ln(close / prev_close) |
| 1 | high_low_range | (high - low) / close |
| 2 | open_close_body | (close - open) / close |
| 3 | upper_wick | (high - max(open,close)) / close |
| 4 | lower_wick | (min(open,close) - low) / close |
| 5 | log_volume | ln(volume + 1) |
| 6 | volume_change | (vol - prev_vol) / (prev_vol + 1) |
| 7 | close_sma5_ratio | close / SMA(5) - 1 |
| 8 | close_sma12_ratio | close / SMA(12) - 1 |
| 9 | volatility_5 | std(log_returns, 5) |
| 10 | ema_9_ratio | close / EMA(9) - 1 |
| 11 | ema_21_ratio | close / EMA(21) - 1 |
| 12 | sma_20_ratio | close / SMA(20) - 1 |
| 13 | ema_9_21_cross | EMA(9) / EMA(21) - 1 |
| 14 | sma_5_20_cross | SMA(5) / SMA(20) - 1 |
| 15 | rsi_14 | RSI(14) normalized to [-1, 1] |
| 16 | rsi_7 | RSI(7) normalized to [-1, 1] |
| 17 | rsi_delta | RSI(14) momentum |
| 18 | macd_line | (EMA12 - EMA26) / close |
| 19 | macd_signal | EMA9(MACD) / close |
| 20 | macd_histogram | (MACD - signal) / close |
| 21 | bb_upper_dist | (upper_band - close) / close |
| 22 | bb_lower_dist | (close - lower_band) / close |
| 23 | bb_width | (upper - lower) / middle |
| 24 | volume_sma5_ratio | volume / SMA(volume, 5) |
| 25 | volume_sma20_ratio | volume / SMA(volume, 20) |
| 26 | obv_change | Normalized OBV change |
| 27 | vwap_ratio | close / VWAP(20) - 1 |
| 28 | roc_6 | Rate of Change(6 periods) |
| 29 | roc_12 | Rate of Change(12 periods) |
| 30 | stoch_k | Stochastic %K(14) normalized |
| 31 | stoch_d | Stochastic %D(3) normalized |
| 32 | atr_14 | ATR(14) / close |
| 33 | volatility_12 | std(log_returns, 12) |

## How Autoresearch Works

The system follows the [autoresearch](https://github.com/trevin-creator/autoresearch-mlx) pattern:

1. Train the model (5 min budget per experiment)
2. Measure `val_sharpe` on held-out data
3. If Sharpe improved → git commit the change
4. If not → git revert to previous best
5. Log results to `results.tsv`
6. Repeat with a new hypothesis

Only `train.py` is modified. You can change:
- Model architecture (layers, heads, hidden dim)
- Hyperparameters (learning rate, batch size, dropout)
- Loss function (MSE, directional, asymmetric)
- Trading threshold
- Optimizer settings

## Trading Strategy

The model uses a **long-only** strategy:
- Predicts the expected log return for the next candle
- Goes long when prediction > threshold (default: 0.0)
- Stays flat otherwise
- Performance is measured by Sharpe ratio on the validation set

## Requirements

- macOS with Apple Silicon (M1/M2/M3/M4)
- Python 3.10+
- Node.js 18+ (for dashboard)
- MLX, NumPy
