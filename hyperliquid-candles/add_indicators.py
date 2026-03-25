#!/usr/bin/env python3
"""
Reads 1h candle JSON files from 1hdata/, computes technical indicators,
and writes the enriched data back to the same JSON files.

Indicators added to each candle:
  - SMA_20, SMA_50, SMA_200 (Simple Moving Averages)
  - EMA_12, EMA_26 (Exponential Moving Averages)
  - MACD, MACD_signal, MACD_histogram
  - RSI_14
  - BB_upper, BB_middle, BB_lower (Bollinger Bands, 20-period, 2 std)
  - ATR_14 (Average True Range)
  - OBV (On-Balance Volume)
  - VWAP (rolling 24-candle VWAP for 1h data = 24h)
  - Stoch_K, Stoch_D (Stochastic Oscillator, 14/3/3)
  - ADX_14 (Average Directional Index)
  - CCI_20 (Commodity Channel Index)
  - Williams_%R_14
"""

import glob
import json
import math
import os

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "1hdata")


def to_floats(candles: list[dict], key: str) -> list[float]:
    return [float(c[key]) for c in candles]


def sma(values: list[float], period: int) -> list[float | None]:
    result = [None] * len(values)
    for i in range(period - 1, len(values)):
        result[i] = sum(values[i - period + 1 : i + 1]) / period
    return result


def ema(values: list[float], period: int) -> list[float | None]:
    result: list[float | None] = [None] * len(values)
    k = 2.0 / (period + 1)
    # Seed with SMA
    if len(values) < period:
        return result
    result[period - 1] = sum(values[:period]) / period
    for i in range(period, len(values)):
        result[i] = values[i] * k + result[i - 1] * (1 - k)
    return result


def compute_rsi(closes: list[float], period: int = 14) -> list[float | None]:
    result: list[float | None] = [None] * len(closes)
    if len(closes) < period + 1:
        return result

    gains = []
    losses = []
    for i in range(1, period + 1):
        delta = closes[i] - closes[i - 1]
        gains.append(max(delta, 0))
        losses.append(max(-delta, 0))

    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period

    if avg_loss == 0:
        result[period] = 100.0
    else:
        rs = avg_gain / avg_loss
        result[period] = 100.0 - 100.0 / (1.0 + rs)

    for i in range(period + 1, len(closes)):
        delta = closes[i] - closes[i - 1]
        gain = max(delta, 0)
        loss = max(-delta, 0)
        avg_gain = (avg_gain * (period - 1) + gain) / period
        avg_loss = (avg_loss * (period - 1) + loss) / period
        if avg_loss == 0:
            result[i] = 100.0
        else:
            rs = avg_gain / avg_loss
            result[i] = 100.0 - 100.0 / (1.0 + rs)

    return result


def compute_bollinger(closes: list[float], period: int = 20, num_std: float = 2.0):
    upper = [None] * len(closes)
    middle = [None] * len(closes)
    lower = [None] * len(closes)

    for i in range(period - 1, len(closes)):
        window = closes[i - period + 1 : i + 1]
        mean = sum(window) / period
        variance = sum((x - mean) ** 2 for x in window) / period
        std = math.sqrt(variance)
        middle[i] = mean
        upper[i] = mean + num_std * std
        lower[i] = mean - num_std * std

    return upper, middle, lower


def compute_atr(highs: list[float], lows: list[float], closes: list[float], period: int = 14):
    result: list[float | None] = [None] * len(closes)
    if len(closes) < 2:
        return result

    true_ranges = [highs[0] - lows[0]]
    for i in range(1, len(closes)):
        tr = max(
            highs[i] - lows[i],
            abs(highs[i] - closes[i - 1]),
            abs(lows[i] - closes[i - 1]),
        )
        true_ranges.append(tr)

    if len(true_ranges) < period:
        return result

    result[period - 1] = sum(true_ranges[:period]) / period
    for i in range(period, len(closes)):
        result[i] = (result[i - 1] * (period - 1) + true_ranges[i]) / period

    return result


def compute_obv(closes: list[float], volumes: list[float]) -> list[float]:
    obv = [0.0]
    for i in range(1, len(closes)):
        if closes[i] > closes[i - 1]:
            obv.append(obv[-1] + volumes[i])
        elif closes[i] < closes[i - 1]:
            obv.append(obv[-1] - volumes[i])
        else:
            obv.append(obv[-1])
    return obv


def compute_vwap(highs: list[float], lows: list[float], closes: list[float], volumes: list[float], period: int = 24):
    result: list[float | None] = [None] * len(closes)
    for i in range(period - 1, len(closes)):
        cum_vol = 0.0
        cum_tp_vol = 0.0
        for j in range(i - period + 1, i + 1):
            tp = (highs[j] + lows[j] + closes[j]) / 3.0
            cum_tp_vol += tp * volumes[j]
            cum_vol += volumes[j]
        result[i] = cum_tp_vol / cum_vol if cum_vol > 0 else None
    return result


def compute_stochastic(highs: list[float], lows: list[float], closes: list[float], k_period: int = 14, d_period: int = 3):
    k_values: list[float | None] = [None] * len(closes)
    d_values: list[float | None] = [None] * len(closes)

    for i in range(k_period - 1, len(closes)):
        high_max = max(highs[i - k_period + 1 : i + 1])
        low_min = min(lows[i - k_period + 1 : i + 1])
        if high_max == low_min:
            k_values[i] = 50.0
        else:
            k_values[i] = 100.0 * (closes[i] - low_min) / (high_max - low_min)

    # %D is SMA of %K
    for i in range(k_period - 1 + d_period - 1, len(closes)):
        window = [k_values[j] for j in range(i - d_period + 1, i + 1) if k_values[j] is not None]
        if len(window) == d_period:
            d_values[i] = sum(window) / d_period

    return k_values, d_values


def compute_adx(highs: list[float], lows: list[float], closes: list[float], period: int = 14):
    n = len(closes)
    result: list[float | None] = [None] * n
    if n < period + 1:
        return result

    plus_dm = []
    minus_dm = []
    tr_list = []

    for i in range(1, n):
        up = highs[i] - highs[i - 1]
        down = lows[i - 1] - lows[i]
        plus_dm.append(up if up > down and up > 0 else 0.0)
        minus_dm.append(down if down > up and down > 0 else 0.0)
        tr_list.append(max(
            highs[i] - lows[i],
            abs(highs[i] - closes[i - 1]),
            abs(lows[i] - closes[i - 1]),
        ))

    if len(tr_list) < period:
        return result

    # Initial smoothed values
    smoothed_tr = sum(tr_list[:period])
    smoothed_plus = sum(plus_dm[:period])
    smoothed_minus = sum(minus_dm[:period])

    dx_values = []

    for i in range(period - 1, len(tr_list)):
        if i == period - 1:
            pass  # already seeded
        else:
            smoothed_tr = smoothed_tr - smoothed_tr / period + tr_list[i]
            smoothed_plus = smoothed_plus - smoothed_plus / period + plus_dm[i]
            smoothed_minus = smoothed_minus - smoothed_minus / period + minus_dm[i]

        plus_di = 100.0 * smoothed_plus / smoothed_tr if smoothed_tr > 0 else 0.0
        minus_di = 100.0 * smoothed_minus / smoothed_tr if smoothed_tr > 0 else 0.0
        di_sum = plus_di + minus_di
        dx = 100.0 * abs(plus_di - minus_di) / di_sum if di_sum > 0 else 0.0
        dx_values.append((i + 1, dx))  # i+1 because dm/tr arrays are offset by 1

    # ADX = smoothed average of DX over `period` values
    if len(dx_values) < period:
        return result

    adx_val = sum(d for _, d in dx_values[:period]) / period
    idx = dx_values[period - 1][0]
    if idx < n:
        result[idx] = adx_val

    for j in range(period, len(dx_values)):
        adx_val = (adx_val * (period - 1) + dx_values[j][1]) / period
        idx = dx_values[j][0]
        if idx < n:
            result[idx] = adx_val

    return result


def compute_cci(highs: list[float], lows: list[float], closes: list[float], period: int = 20):
    result: list[float | None] = [None] * len(closes)
    for i in range(period - 1, len(closes)):
        tps = [(highs[j] + lows[j] + closes[j]) / 3.0 for j in range(i - period + 1, i + 1)]
        mean_tp = sum(tps) / period
        mean_dev = sum(abs(tp - mean_tp) for tp in tps) / period
        if mean_dev == 0:
            result[i] = 0.0
        else:
            result[i] = (tps[-1] - mean_tp) / (0.015 * mean_dev)
    return result


def compute_williams_r(highs: list[float], lows: list[float], closes: list[float], period: int = 14):
    result: list[float | None] = [None] * len(closes)
    for i in range(period - 1, len(closes)):
        high_max = max(highs[i - period + 1 : i + 1])
        low_min = min(lows[i - period + 1 : i + 1])
        if high_max == low_min:
            result[i] = -50.0
        else:
            result[i] = -100.0 * (high_max - closes[i]) / (high_max - low_min)
    return result


def round_val(v, decimals=6):
    if v is None:
        return None
    return round(v, decimals)


def add_indicators(candles: list[dict]) -> list[dict]:
    """Add technical indicators to each candle dict."""
    if not candles:
        return candles

    closes = to_floats(candles, "c")
    highs = to_floats(candles, "h")
    lows = to_floats(candles, "l")
    volumes = to_floats(candles, "v")

    # Moving averages
    sma_20 = sma(closes, 20)
    sma_50 = sma(closes, 50)
    sma_200 = sma(closes, 200)
    ema_12 = ema(closes, 12)
    ema_26 = ema(closes, 26)

    # MACD
    macd_line = [None] * len(closes)
    for i in range(len(closes)):
        if ema_12[i] is not None and ema_26[i] is not None:
            macd_line[i] = ema_12[i] - ema_26[i]

    macd_vals = [v if v is not None else 0.0 for v in macd_line]
    macd_signal_raw = ema(macd_vals, 9)
    macd_signal = [None] * len(closes)
    macd_hist = [None] * len(closes)
    for i in range(len(closes)):
        if macd_line[i] is not None and macd_signal_raw[i] is not None:
            macd_signal[i] = macd_signal_raw[i]
            macd_hist[i] = macd_line[i] - macd_signal_raw[i]

    # RSI
    rsi_14 = compute_rsi(closes, 14)

    # Bollinger Bands
    bb_upper, bb_middle, bb_lower = compute_bollinger(closes, 20, 2.0)

    # ATR
    atr_14 = compute_atr(highs, lows, closes, 14)

    # OBV
    obv = compute_obv(closes, volumes)

    # VWAP (24-period rolling for 1h candles = 24h)
    vwap = compute_vwap(highs, lows, closes, volumes, 24)

    # Stochastic
    stoch_k, stoch_d = compute_stochastic(highs, lows, closes, 14, 3)

    # ADX
    adx_14 = compute_adx(highs, lows, closes, 14)

    # CCI
    cci_20 = compute_cci(highs, lows, closes, 20)

    # Williams %R
    williams_r = compute_williams_r(highs, lows, closes, 14)

    # Attach to candles
    for i, c in enumerate(candles):
        c["SMA_20"] = round_val(sma_20[i])
        c["SMA_50"] = round_val(sma_50[i])
        c["SMA_200"] = round_val(sma_200[i])
        c["EMA_12"] = round_val(ema_12[i])
        c["EMA_26"] = round_val(ema_26[i])
        c["MACD"] = round_val(macd_line[i])
        c["MACD_signal"] = round_val(macd_signal[i])
        c["MACD_histogram"] = round_val(macd_hist[i])
        c["RSI_14"] = round_val(rsi_14[i], 2)
        c["BB_upper"] = round_val(bb_upper[i])
        c["BB_middle"] = round_val(bb_middle[i])
        c["BB_lower"] = round_val(bb_lower[i])
        c["ATR_14"] = round_val(atr_14[i])
        c["OBV"] = round_val(obv[i], 2)
        c["VWAP"] = round_val(vwap[i])
        c["Stoch_K"] = round_val(stoch_k[i], 2)
        c["Stoch_D"] = round_val(stoch_d[i], 2)
        c["ADX_14"] = round_val(adx_14[i], 2)
        c["CCI_20"] = round_val(cci_20[i], 2)
        c["Williams_%R_14"] = round_val(williams_r[i], 2)

    return candles


def main():
    json_files = sorted(glob.glob(os.path.join(DATA_DIR, "*.json")))
    if not json_files:
        print(f"No JSON files found in {DATA_DIR}/")
        return

    print(f"Found {len(json_files)} coin files in {DATA_DIR}/")

    for filepath in json_files:
        coin = os.path.basename(filepath).replace(".json", "")
        with open(filepath) as f:
            candles = json.load(f)

        candles = add_indicators(candles)

        with open(filepath, "w") as f:
            json.dump(candles, f, indent=2)

        print(f"  {coin}: {len(candles)} candles enriched with indicators")

    print("\nDone! All files updated with indicators.")


if __name__ == "__main__":
    main()
