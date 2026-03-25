# Hyperliquid Alt Trading — Autoresearch Protocol

## Objective
Maximize the **validation Sharpe ratio** of a trading model that predicts
altcoin returns on Hyperliquid using multi-timeframe candle data (15m, 1h, 4h)
with BTC as a market leader signal.

## Fee Model
- **0.05% per trade side** (buy and sell)
- **0.10% round trip** total
- All trading simulations must account for fees
- The model must predict returns large enough to overcome fees

## Data Architecture
- **Primary timeframe**: 1h candles (each row = 1 hour)
- **Sub-candle detail**: 15m candles (4 per hour — momentum, volatility)
- **Higher timeframe context**: 4h candles (trend, regime)
- **BTC leader features**: BTC candles at 1h and 4h (market leader signals)
- **46 features total** per timestamp

## Experiment Loop

1. **Read** the current `train.py` and recent `results.tsv`
2. **Hypothesize** a single change to improve val_sharpe:
   - Adjust hyperparameters (n_estimators, max_depth, learning_rate, etc.)
   - Change feature processing mode (flatten, last_n, statistics)
   - Modify trading logic (threshold, dynamic threshold, position sizing)
   - Adjust forecast horizon or window size
   - Try different model configurations
   - Experiment with feature subsets
3. **Edit** `train.py` with the change (keep changes minimal and focused)
4. **Run** `python run.py --name "description_of_change"`
5. **Observe**: if val_sharpe improved → change is kept (git committed)
   if val_sharpe did not improve → change is reverted automatically
6. **Repeat** from step 1

## Key Dimensions to Explore

### Timeframe Experiments
- Short-term: 1h forecast horizon (scalping)
- Medium-term: 4h forecast horizon (swing)
- Long-term: 12-24h forecast horizon (position)
- Window sizes: 6h, 12h, 24h, 48h lookback

### Model Tuning
- LightGBM hyperparameters (n_estimators, depth, learning_rate)
- Feature processing mode (flatten vs statistics vs last_n)
- Regularization (alpha, lambda, min_child_samples)

### Trading Logic
- Static vs dynamic threshold
- Threshold levels relative to fees
- Only trade when BTC trend is favorable
- Volume-weighted position entry

### Feature Engineering
- Feature subsets (only BTC features, only 15m, etc.)
- Rolling correlation windows
- Cross-timeframe momentum

## Rules
- Only modify `train.py` — all other files are immutable
- One hypothesis per experiment
- Budget: 5 minutes wall-clock per run
- Primary metric: `val_sharpe` (higher = better)
- Secondary: profit_factor > 1.0, win_rate, total_return
- Always account for 0.05% fees per side

## Running
```bash
# First: fetch data
python fetch_data.py

# Establish baseline
python run.py --baseline

# Run experiments
python run.py --name "increase_n_estimators_to_800"

# Automated (with AI agent modifying train.py between runs)
python run.py --auto 20
```
