import type { Candle } from "./oanda";
import { atr, ema, lastDefined, closes } from "./indicators";

export interface FilterResult {
  ok: boolean;
  reason: string | null;
}

const PASS: FilterResult = { ok: true, reason: null };

/**
 * Session filter: majors are most liquid during London + New York.
 * Allowed window: 07:00–21:00 UTC, Monday–Friday.
 */
export function checkTradingSession(now = new Date()): FilterResult {
  const day = now.getUTCDay(); // 0 Sun .. 6 Sat
  const hour = now.getUTCHours();
  if (day === 0 || day === 6) {
    return { ok: false, reason: "Weekend — market closed or too thin to trade" };
  }
  if (hour < 7 || hour >= 21) {
    return {
      ok: false,
      reason: "Outside London/NY trading hours (07:00–21:00 UTC)",
    };
  }
  return PASS;
}

/**
 * Higher-timeframe trend veto: block signals that fight the bigger trend.
 * Uses EMA50 direction on the higher timeframe.
 */
export function checkHtfTrend(params: {
  side: "BUY" | "SELL";
  htfCandles: Candle[];
  htfLabel: string;
}): FilterResult {
  const c = closes(params.htfCandles);
  if (c.length < 55) return PASS; // not enough data to judge — allow
  const e50 = ema(c, 50);
  const last = c[c.length - 1];
  const emaNow = e50[e50.length - 1];
  if (emaNow == null) return PASS;
  const trendUp = last > emaNow;
  if (params.side === "BUY" && !trendUp) {
    return {
      ok: false,
      reason: `${params.htfLabel} trend is down — blocking BUY against the bigger trend`,
    };
  }
  if (params.side === "SELL" && trendUp) {
    return {
      ok: false,
      reason: `${params.htfLabel} trend is up — blocking SELL against the bigger trend`,
    };
  }
  return PASS;
}

/**
 * Correlation guard: don't stack exposure on the same currency.
 * EUR_USD open + new EUR_JPY would double EUR risk.
 */
export function checkCorrelation(params: {
  instrument: string;
  openInstruments: string[];
}): FilterResult {
  const [base, quote] = params.instrument.split("_");
  for (const open of params.openInstruments) {
    if (open === params.instrument) {
      return { ok: false, reason: `Already in a ${open} trade` };
    }
    const [ob, oq] = open.split("_");
    const shared = [base, quote].find((c) => c === ob || c === oq);
    if (shared) {
      return {
        ok: false,
        reason: `Already exposed to ${shared} via ${open} — correlated trades double your risk`,
      };
    }
  }
  return PASS;
}

/**
 * Volatility sanity check: skip entries during news-spike conditions
 * (current ATR far above its recent average).
 */
export function checkVolatility(candles: Candle[]): FilterResult {
  const series = atr(candles, 14);
  const current = lastDefined(series);
  if (current == null) return PASS;
  const defined = series.filter((v): v is number => v != null);
  if (defined.length < 30) return PASS;
  const window = defined.slice(-50);
  const avg = window.reduce((a, b) => a + b, 0) / window.length;
  if (avg > 0 && current > 3 * avg) {
    return {
      ok: false,
      reason:
        "Market too volatile right now (possible news spike) — waiting for calmer conditions",
    };
  }
  return PASS;
}

/** Run the entry filters that only need the primary candles + open positions. */
export function runEntryFilters(params: {
  instrument: string;
  candles: Candle[];
  openInstruments: string[];
  sessionFilterEnabled: boolean;
  now?: Date;
}): FilterResult {
  if (params.sessionFilterEnabled) {
    const session = checkTradingSession(params.now);
    if (!session.ok) return session;
  }
  const corr = checkCorrelation({
    instrument: params.instrument,
    openInstruments: params.openInstruments,
  });
  if (!corr.ok) return corr;
  const vol = checkVolatility(params.candles);
  if (!vol.ok) return vol;
  return PASS;
}
