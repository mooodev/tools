# ML Token Growth Predictor

Machine learning system that predicts Solana token price growth using TensorFlow.js with GPU support. Built on a Simons/Renaissance Technologies inspired quantitative approach.

## Architecture

**Model**: Stacked LSTM with Self-Attention mechanism + Dense classifier

```
Input [48 timesteps × 40+ features]
  → LSTM (128 units, return sequences)
  → Dropout (0.3)
  → Self-Attention (Q/K/V, 64-dim)
  → LSTM (64 units)
  → Dropout (0.3)
  → Dense (32 units, ReLU)
  → Dense (3 units, Softmax)
Output: [Bearish, Neutral, Bullish] probabilities
```

## Features (Simons-Style Quantitative)

**Momentum & Trend:**
- Multi-scale Rate of Change (1, 3, 6, 12, 24 periods)
- EMA crossover signals (12/26)
- MACD (line, signal, histogram — price-normalized)

**Mean Reversion:**
- SMA ratios at multiple scales (5, 10, 20, 50)
- EMA ratios at multiple scales
- Bollinger Band %B and bandwidth
- VWAP deviation

**Oscillators:**
- RSI (14-period)
- Stochastic K/D
- CCI (Commodity Channel Index)
- Williams %R
- Money Flow Index

**Volatility & Risk:**
- Multi-scale realized volatility (10, 20, 40 periods)
- Volatility regime detector (short/long ratio)
- ATR (price-normalized)

**Statistical (Distributional):**
- Return skewness (20-period rolling)
- Return kurtosis (fat tail detection)
- Hurst exponent (trend vs mean-reversion regime)

**Volume:**
- On-Balance Volume ratio
- Volume surge detector (vs 20-period SMA)
- Volume-price correlation (20-period rolling)

**Structural:**
- Candle body ratio, upper/lower shadows
- Cyclical time encoding (hour-of-day, day-of-week)

## Setup

```bash
cd ml-predictor
npm install
```

**GPU Support**: Requires CUDA toolkit installed. Falls back to CPU automatically.

## Usage

```bash
# Show dataset info and feature list
node src/index.js info

# Train the model on all available token data
node src/index.js train

# Walk-forward cross-validation (Simons approach — no future leakage)
node src/index.js evaluate 5

# Predict growth for a specific token
node src/index.js predict <mint_address>

# Screen all tokens and rank by growth probability
node src/index.js screen

# Backtest trading strategy on held-out data
node src/index.js backtest
```

## Data

Reads candlestick OHLCV data from the `pump-fun-parser` output directory (`../pump-fun-parser/data/`). Run the parser first to collect token data.

## How It Works

1. **Data Loading**: Reads hourly OHLCV candles from disk for all graduated tokens
2. **Feature Engineering**: Computes 40+ technical indicators and statistical features per candle
3. **Normalization**: Z-score normalization with outlier clipping (±5σ)
4. **Sequencing**: Creates sliding windows of 48 hours for LSTM input
5. **Training**: LSTM + Attention model with early stopping, class balancing, L2 regularization
6. **Prediction**: Classifies future 6-hour return into Bearish (<-5%), Neutral, Bullish (>+10%)

## Configuration

Key parameters in `src/config.js`:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `LOOKBACK_WINDOW` | 48 | Hours of history per sample |
| `PREDICTION_HORIZON` | 6 | Hours ahead to predict |
| `GROWTH_THRESHOLD_UP` | 0.10 | Bullish = >10% growth |
| `GROWTH_THRESHOLD_DN` | -0.05 | Bearish = >5% decline |
| `LSTM_UNITS_1` | 128 | First LSTM layer size |
| `LSTM_UNITS_2` | 64 | Second LSTM layer size |
| `EPOCHS` | 50 | Max training epochs |
| `PATIENCE` | 8 | Early stopping patience |
