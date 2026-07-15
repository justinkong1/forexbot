import type { Candle } from "./oanda";

export function closes(candles: Candle[]): number[] {
  return candles.map((c) => c.close);
}

export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev =
    values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function atr(candles: Candle[], period = 14): (number | null)[] {
  const out: (number | null)[] = Array(candles.length).fill(null);
  if (candles.length < 2) return out;
  const trs: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    trs.push(
      Math.max(
        c.high - c.low,
        Math.abs(c.high - prev.close),
        Math.abs(c.low - prev.close),
      ),
    );
  }
  if (candles.length <= period) return out;
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += trs[i];
  let prev = sum / period;
  out[period] = prev;
  for (let i = period + 1; i < candles.length; i++) {
    prev = (prev * (period - 1) + trs[i]) / period;
    out[i] = prev;
  }
  return out;
}

export function macd(
  values: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): {
  macd: (number | null)[];
  signal: (number | null)[];
  hist: (number | null)[];
} {
  const fastE = ema(values, fast);
  const slowE = ema(values, slow);
  const macdLine: (number | null)[] = values.map((_, i) =>
    fastE[i] != null && slowE[i] != null ? (fastE[i] as number) - (slowE[i] as number) : null,
  );
  const macdNums = macdLine.map((v) => v ?? 0);
  // Build signal only on defined macd points — approximate by EMA on sparse series
  const firstDefined = macdLine.findIndex((v) => v != null);
  const signal: (number | null)[] = Array(values.length).fill(null);
  const hist: (number | null)[] = Array(values.length).fill(null);
  if (firstDefined < 0) return { macd: macdLine, signal, hist };

  const definedVals: number[] = [];
  const definedIdx: number[] = [];
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] != null) {
      definedVals.push(macdLine[i] as number);
      definedIdx.push(i);
    }
  }
  const sigE = ema(definedVals, signalPeriod);
  for (let j = 0; j < definedIdx.length; j++) {
    const i = definedIdx[j];
    signal[i] = sigE[j];
    if (sigE[j] != null && macdLine[i] != null) {
      hist[i] = (macdLine[i] as number) - (sigE[j] as number);
    }
  }
  void macdNums;
  return { macd: macdLine, signal, hist };
}

export function bollinger(
  values: number[],
  period = 20,
  mult = 2,
): {
  mid: (number | null)[];
  upper: (number | null)[];
  lower: (number | null)[];
} {
  const mid = sma(values, period);
  const upper: (number | null)[] = Array(values.length).fill(null);
  const lower: (number | null)[] = Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);
    const m = mid[i] as number;
    const variance =
      slice.reduce((a, v) => a + (v - m) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    upper[i] = m + mult * sd;
    lower[i] = m - mult * sd;
  }
  return { mid, upper, lower };
}

export function lastDefined<T>(arr: (T | null)[]): T | null {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] != null) return arr[i] as T;
  }
  return null;
}

export function pricePrecision(instrument: string): number {
  return instrument.includes("JPY") ? 3 : 5;
}

export function roundPrice(price: number, instrument: string): number {
  const p = pricePrecision(instrument);
  const f = 10 ** p;
  return Math.round(price * f) / f;
}
