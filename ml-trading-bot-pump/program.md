# Autoresearch — Pump.fun MLX Trading Bot

## Goal

Train a model on Apple Silicon (via MLX) that learns to profitably **long**
pump.fun tokens using hourly candle data. The single metric to optimize is
**validation Sharpe ratio** (`val_sharpe`).

## Files

| File | Role | Mutable? |
|------|------|----------|
| `prepare.py` | Data loading, 34 technical indicators, trading simulation | **NO** |
| `train.py` | Model architecture, hyperparameters, training loop | **YES** |
| `program.md` | This protocol document | **NO** |
| `run.py` | Experiment runner (git-based keep/revert loop) | **NO** |
| `results.tsv` | Experiment log | Append only |
| `metrics.jsonl` | Live training metrics (read by dashboard) | Auto |
| `data/*.json` | Candle data files | **NO** |
| `dashboard/` | Node.js monitoring dashboard | **NO** |

## Technical Indicators (34 features)

The `prepare.py` module computes these per-candle features:

**Raw OHLCV (0-9):** log return, high-low range, candle body, upper/lower wick,
log volume, volume change, close/SMA5 ratio, close/SMA12 ratio, 5-period volatility.

**Moving Averages (10-14):** EMA(9), EMA(21), SMA(20) ratios to close,
EMA(9)/EMA(21) crossover, SMA(5)/SMA(20) crossover.

**RSI (15-17):** RSI(14), RSI(7) (normalized to [-1,1]), RSI momentum (delta).

**MACD (18-20):** MACD line, signal line, histogram (all normalized by close).

**Bollinger Bands (21-23):** Upper band distance, lower band distance, bandwidth.

**Volume (24-27):** Volume/SMA(5), Volume/SMA(20) ratios, OBV change, VWAP ratio.

**Momentum (28-33):** ROC(6), ROC(12), Stochastic %K(14), %D(3),
ATR(14)/close, 12-period volatility.

## Experiment Protocol

Each experiment follows this loop:

1. **Read** `results.tsv` to understand what has been tried and what worked.
2. **Propose** a single, focused change to `train.py`. Examples:
   - Change model architecture (depth, width, attention heads)
   - Adjust hyperparameters (learning rate, batch size, dropout)
   - Modify the loss function or add regularization
   - Change the trading threshold or position sizing
   - Add new derived features in the model's forward pass
   - Try different optimizers or learning rate schedules
3. **Implement** the change in `train.py`.
4. **Run** `python train.py` (must complete within TIME_BUDGET, default 5 min).
5. **Parse** the output for `>>> val_sharpe X.XXXX`.
6. **Compare** to the previous best `val_sharpe`.
7. **If improved**: `git commit` the change. Record in `results.tsv`.
8. **If not improved**: `git checkout -- train.py` to revert. Record in `results.tsv`.

## Rules

- Only modify `train.py`. Never touch `prepare.py`, `program.md`, or `run.py`.
- Each experiment must be a **single focused change** — no multi-variable changes.
- Always explain your hypothesis before making a change.
- If an experiment crashes, revert and log the error.
- The TIME_BUDGET in `train.py` controls max training time (default: 300s).
- Do not increase TIME_BUDGET above 600s.

## Metric

The primary metric is **`val_sharpe`** — the annualized Sharpe ratio of the
long-only strategy on the validation set. Higher is better.

Secondary metrics to monitor (but not optimize directly):
- `total_return` — cumulative log return on val set
- `win_rate` — fraction of long trades that are profitable
- `n_trades` — number of trades taken (too few = not useful)
- `max_drawdown` — worst peak-to-trough decline

## Dashboard

The Node.js dashboard at `dashboard/` provides real-time monitoring:

```bash
cd dashboard && npm install && npm start
# Open http://localhost:3456
```

Features:
- Start/stop training from the browser
- Live charts: loss curve, Sharpe ratio, win rate, cumulative returns
- Stats cards: current Sharpe, return, win rate, trades, drawdown
- Experiment history table
- Real-time training log output

The dashboard reads `metrics.jsonl` (written by `train.py` each epoch) and
`results.tsv` (written by `run.py` after each experiment).

## Data Format

Input JSON files in `data/` have this structure:

```json
{
  "meta": {
    "tokenAddress": "...",
    "tokenName": "...",
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

## Tips for the Agent

- Pump.fun tokens are extremely volatile — high noise, regime changes.
- Simpler models often beat complex ones on noisy financial data.
- Watch for overfitting: big train/val gaps mean the model memorized noise.
- The direction of prediction matters more than magnitude for trading.
- Consider asymmetric loss (penalize false longs more than missed longs).
- Volume spikes often precede large moves — pay attention to volume features.
- Mean reversion and momentum can coexist at different timescales.
- The 34 indicators give rich signal — the model may benefit from feature selection.
