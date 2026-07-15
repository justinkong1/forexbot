import type { Candle } from "./oanda";
import {
  atr,
  bollinger,
  closes,
  ema,
  lastDefined,
  macd,
  roundPrice,
  rsi,
} from "./indicators";

export type StrategyId =
  | "ema_cross"
  | "rsi_reversion"
  | "macd_cross"
  | "bb_bounce";

export interface StrategySignal {
  id: StrategyId;
  name: string;
  bias: "BUY" | "SELL" | "WAIT";
  confidence: number;
  rationale: string;
  takeProfit: number | null;
  stopLoss: number | null;
  entry: number;
}

export const STRATEGY_CATALOG: Array<{
  id: StrategyId;
  name: string;
  summary: string;
}> = [
  {
    id: "ema_cross",
    name: "EMA Cross + Trend",
    summary: "9/21 EMA crossover with EMA50 trend filter — classic trend entry",
  },
  {
    id: "rsi_reversion",
    name: "RSI Pullback",
    summary: "RSI oversold/overbought bounce in direction of EMA50 trend",
  },
  {
    id: "macd_cross",
    name: "MACD Momentum",
    summary: "MACD line crosses signal with histogram confirmation",
  },
  {
    id: "bb_bounce",
    name: "Bollinger Bounce",
    summary: "Price tags outer Bollinger band with RSI confirmation",
  },
];

export const DEFAULT_ENABLED_STRATEGIES = STRATEGY_CATALOG.map((s) => s.id).join(
  ",",
);

function levelsFromAtr(
  instrument: string,
  entry: number,
  side: "BUY" | "SELL",
  atrVal: number,
  slMult: number,
  tpMult: number,
): { takeProfit: number; stopLoss: number } {
  const slDist = atrVal * slMult;
  const tpDist = atrVal * tpMult;
  if (side === "BUY") {
    return {
      stopLoss: roundPrice(entry - slDist, instrument),
      takeProfit: roundPrice(entry + tpDist, instrument),
    };
  }
  return {
    stopLoss: roundPrice(entry + slDist, instrument),
    takeProfit: roundPrice(entry - tpDist, instrument),
  };
}

function wait(
  id: StrategyId,
  name: string,
  entry: number,
  rationale: string,
): StrategySignal {
  return {
    id,
    name,
    bias: "WAIT",
    confidence: 0,
    rationale,
    takeProfit: null,
    stopLoss: null,
    entry,
  };
}

function evalEmaCross(
  instrument: string,
  candles: Candle[],
  atrVal: number,
  slMult: number,
  tpMult: number,
): StrategySignal {
  const name = "EMA Cross + Trend";
  const c = closes(candles);
  const entry = c[c.length - 1];
  const e9 = ema(c, 9);
  const e21 = ema(c, 21);
  const e50 = ema(c, 50);
  const i = c.length - 1;
  const p = i - 1;
  if (
    e9[i] == null ||
    e21[i] == null ||
    e50[i] == null ||
    e9[p] == null ||
    e21[p] == null
  ) {
    return wait("ema_cross", name, entry, "Not enough bars for EMA cross");
  }
  const crossUp = (e9[p] as number) <= (e21[p] as number) && (e9[i] as number) > (e21[i] as number);
  const crossDown =
    (e9[p] as number) >= (e21[p] as number) && (e9[i] as number) < (e21[i] as number);
  const trendUp = entry > (e50[i] as number);
  const trendDown = entry < (e50[i] as number);

  if (crossUp && trendUp) {
    const lv = levelsFromAtr(instrument, entry, "BUY", atrVal, slMult, tpMult);
    return {
      id: "ema_cross",
      name,
      bias: "BUY",
      confidence: 0.72,
      rationale: `EMA9 crossed above EMA21 with price above EMA50 (uptrend filter). ATR-based TP/SL.`,
      ...lv,
      entry,
    };
  }
  if (crossDown && trendDown) {
    const lv = levelsFromAtr(instrument, entry, "SELL", atrVal, slMult, tpMult);
    return {
      id: "ema_cross",
      name,
      bias: "SELL",
      confidence: 0.72,
      rationale: `EMA9 crossed below EMA21 with price below EMA50 (downtrend filter). ATR-based TP/SL.`,
      ...lv,
      entry,
    };
  }
  return wait(
    "ema_cross",
    name,
    entry,
    "No fresh EMA9/21 cross aligned with EMA50 trend",
  );
}

function evalRsiReversion(
  instrument: string,
  candles: Candle[],
  atrVal: number,
  slMult: number,
  tpMult: number,
): StrategySignal {
  const name = "RSI Pullback";
  const c = closes(candles);
  const entry = c[c.length - 1];
  const r = rsi(c, 14);
  const e50 = ema(c, 50);
  const i = c.length - 1;
  const p = i - 1;
  if (r[i] == null || r[p] == null || e50[i] == null) {
    return wait("rsi_reversion", name, entry, "Not enough bars for RSI");
  }
  const rsiNow = r[i] as number;
  const rsiPrev = r[p] as number;
  const trendUp = entry > (e50[i] as number);
  const trendDown = entry < (e50[i] as number);

  // Oversold bounce in uptrend
  if (trendUp && rsiPrev < 30 && rsiNow >= 30 && rsiNow < 50) {
    const lv = levelsFromAtr(instrument, entry, "BUY", atrVal, slMult, tpMult);
    return {
      id: "rsi_reversion",
      name,
      bias: "BUY",
      confidence: 0.68,
      rationale: `RSI exited oversold (${rsiPrev.toFixed(1)}→${rsiNow.toFixed(1)}) while price holds above EMA50.`,
      ...lv,
      entry,
    };
  }
  // Overbought fade in downtrend
  if (trendDown && rsiPrev > 70 && rsiNow <= 70 && rsiNow > 50) {
    const lv = levelsFromAtr(instrument, entry, "SELL", atrVal, slMult, tpMult);
    return {
      id: "rsi_reversion",
      name,
      bias: "SELL",
      confidence: 0.68,
      rationale: `RSI exited overbought (${rsiPrev.toFixed(1)}→${rsiNow.toFixed(1)}) while price holds below EMA50.`,
      ...lv,
      entry,
    };
  }
  return wait(
    "rsi_reversion",
    name,
    entry,
    `RSI ${rsiNow.toFixed(1)} — no pullback trigger vs EMA50`,
  );
}

function evalMacdCross(
  instrument: string,
  candles: Candle[],
  atrVal: number,
  slMult: number,
  tpMult: number,
): StrategySignal {
  const name = "MACD Momentum";
  const c = closes(candles);
  const entry = c[c.length - 1];
  const m = macd(c);
  const i = c.length - 1;
  const p = i - 1;
  if (
    m.macd[i] == null ||
    m.signal[i] == null ||
    m.macd[p] == null ||
    m.signal[p] == null
  ) {
    return wait("macd_cross", name, entry, "Not enough bars for MACD");
  }
  const crossUp =
    (m.macd[p] as number) <= (m.signal[p] as number) &&
    (m.macd[i] as number) > (m.signal[i] as number);
  const crossDown =
    (m.macd[p] as number) >= (m.signal[p] as number) &&
    (m.macd[i] as number) < (m.signal[i] as number);
  const hist = m.hist[i] as number | null;

  if (crossUp && hist != null && hist > 0) {
    const lv = levelsFromAtr(instrument, entry, "BUY", atrVal, slMult, tpMult);
    return {
      id: "macd_cross",
      name,
      bias: "BUY",
      confidence: 0.7,
      rationale: `MACD crossed above signal with positive histogram (${hist.toFixed(5)}).`,
      ...lv,
      entry,
    };
  }
  if (crossDown && hist != null && hist < 0) {
    const lv = levelsFromAtr(instrument, entry, "SELL", atrVal, slMult, tpMult);
    return {
      id: "macd_cross",
      name,
      bias: "SELL",
      confidence: 0.7,
      rationale: `MACD crossed below signal with negative histogram (${hist.toFixed(5)}).`,
      ...lv,
      entry,
    };
  }
  return wait("macd_cross", name, entry, "No MACD signal-line cross this bar");
}

function evalBbBounce(
  instrument: string,
  candles: Candle[],
  atrVal: number,
  slMult: number,
  tpMult: number,
): StrategySignal {
  const name = "Bollinger Bounce";
  const c = closes(candles);
  const entry = c[c.length - 1];
  const bb = bollinger(c, 20, 2);
  const r = rsi(c, 14);
  const i = c.length - 1;
  const p = i - 1;
  if (bb.lower[i] == null || bb.upper[i] == null || r[i] == null) {
    return wait("bb_bounce", name, entry, "Not enough bars for Bollinger/RSI");
  }
  const touchedLower =
    candles[i].low <= (bb.lower[i] as number) ||
    candles[p].low <= (bb.lower[p] as number);
  const touchedUpper =
    candles[i].high >= (bb.upper[i] as number) ||
    candles[p].high >= (bb.upper[p] as number);
  const rsiNow = r[i] as number;

  if (touchedLower && rsiNow < 40 && entry > candles[p].close) {
    const lv = levelsFromAtr(instrument, entry, "BUY", atrVal, slMult, tpMult);
    return {
      id: "bb_bounce",
      name,
      bias: "BUY",
      confidence: 0.65,
      rationale: `Price tagged lower Bollinger with RSI ${rsiNow.toFixed(1)} and a bounce close.`,
      ...lv,
      entry,
    };
  }
  if (touchedUpper && rsiNow > 60 && entry < candles[p].close) {
    const lv = levelsFromAtr(instrument, entry, "SELL", atrVal, slMult, tpMult);
    return {
      id: "bb_bounce",
      name,
      bias: "SELL",
      confidence: 0.65,
      rationale: `Price tagged upper Bollinger with RSI ${rsiNow.toFixed(1)} and a reject close.`,
      ...lv,
      entry,
    };
  }
  return wait("bb_bounce", name, entry, "No Bollinger extreme + bounce confirmation");
}

export interface StrategyScanResult {
  signals: StrategySignal[];
  consensus: StrategySignal | null;
  buyVotes: number;
  sellVotes: number;
  atr: number | null;
  entry: number;
}

export function scanStrategies(params: {
  instrument: string;
  candles: Candle[];
  enabledIds: StrategyId[];
  minVotes?: number;
  atrSlMult?: number;
  atrTpMult?: number;
}): StrategyScanResult {
  const slMult = params.atrSlMult ?? 1.5;
  const tpMult = params.atrTpMult ?? 2.5;
  const minVotes = params.minVotes ?? 1;
  const atrSeries = atr(params.candles, 14);
  const atrVal = lastDefined(atrSeries) ?? 0;
  const entry = params.candles[params.candles.length - 1]?.close ?? 0;

  if (atrVal <= 0 || entry <= 0) {
    return {
      signals: [],
      consensus: null,
      buyVotes: 0,
      sellVotes: 0,
      atr: null,
      entry,
    };
  }

  const runners: Record<
    StrategyId,
    () => StrategySignal
  > = {
    ema_cross: () =>
      evalEmaCross(params.instrument, params.candles, atrVal, slMult, tpMult),
    rsi_reversion: () =>
      evalRsiReversion(params.instrument, params.candles, atrVal, slMult, tpMult),
    macd_cross: () =>
      evalMacdCross(params.instrument, params.candles, atrVal, slMult, tpMult),
    bb_bounce: () =>
      evalBbBounce(params.instrument, params.candles, atrVal, slMult, tpMult),
  };

  const signals = params.enabledIds
    .filter((id) => runners[id])
    .map((id) => runners[id]());

  const actionable = signals.filter((s) => s.bias !== "WAIT");
  const buyVotes = actionable.filter((s) => s.bias === "BUY").length;
  const sellVotes = actionable.filter((s) => s.bias === "SELL").length;

  let consensus: StrategySignal | null = null;
  if (buyVotes >= minVotes && buyVotes > sellVotes) {
    const buys = actionable.filter((s) => s.bias === "BUY");
    const best = [...buys].sort((a, b) => b.confidence - a.confidence)[0];
    // Average TP/SL from agreeing strategies for stability
    const avgTp =
      buys.reduce((a, s) => a + (s.takeProfit || 0), 0) / buys.length;
    const avgSl =
      buys.reduce((a, s) => a + (s.stopLoss || 0), 0) / buys.length;
    consensus = {
      ...best,
      bias: "BUY",
      confidence: Math.min(
        0.95,
        best.confidence + 0.05 * (buyVotes - 1),
      ),
      takeProfit: roundPrice(avgTp, params.instrument),
      stopLoss: roundPrice(avgSl, params.instrument),
      rationale: `Confluence BUY (${buyVotes} strategies): ${buys
        .map((s) => s.name)
        .join(", ")}. ${best.rationale}`,
    };
  } else if (sellVotes >= minVotes && sellVotes > buyVotes) {
    const sells = actionable.filter((s) => s.bias === "SELL");
    const best = [...sells].sort((a, b) => b.confidence - a.confidence)[0];
    const avgTp =
      sells.reduce((a, s) => a + (s.takeProfit || 0), 0) / sells.length;
    const avgSl =
      sells.reduce((a, s) => a + (s.stopLoss || 0), 0) / sells.length;
    consensus = {
      ...best,
      bias: "SELL",
      confidence: Math.min(
        0.95,
        best.confidence + 0.05 * (sellVotes - 1),
      ),
      takeProfit: roundPrice(avgTp, params.instrument),
      stopLoss: roundPrice(avgSl, params.instrument),
      rationale: `Confluence SELL (${sellVotes} strategies): ${sells
        .map((s) => s.name)
        .join(", ")}. ${best.rationale}`,
    };
  }

  return {
    signals,
    consensus,
    buyVotes,
    sellVotes,
    atr: atrVal,
    entry,
  };
}

export function parseEnabledStrategies(csv: string | null | undefined): StrategyId[] {
  const all = STRATEGY_CATALOG.map((s) => s.id);
  if (!csv || !csv.trim()) return all;
  const wanted = csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as StrategyId[];
  const valid = wanted.filter((id) => all.includes(id));
  return valid.length ? valid : all;
}
