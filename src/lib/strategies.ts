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
  | "bb_bounce"
  | "donchian_break"
  | "htf_pullback";

export type TradeStyle = "day" | "swing";

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
  styles: TradeStyle[];
}> = [
  {
    id: "ema_cross",
    name: "EMA Cross + Trend",
    summary: "9/21 EMA crossover with EMA50 trend filter — classic trend entry",
    styles: ["day", "swing"],
  },
  {
    id: "rsi_reversion",
    name: "RSI Pullback",
    summary: "RSI oversold/overbought bounce in direction of EMA50 trend",
    styles: ["day"],
  },
  {
    id: "macd_cross",
    name: "MACD Momentum",
    summary: "MACD line crosses signal with histogram confirmation",
    styles: ["day", "swing"],
  },
  {
    id: "bb_bounce",
    name: "Bollinger Bounce",
    summary: "Price tags outer Bollinger band with RSI confirmation",
    styles: ["day"],
  },
  {
    id: "donchian_break",
    name: "Donchian Breakout",
    summary:
      "Close breaks the 20-bar high/low channel with EMA50 trend agreement — classic multi-day trend entry",
    styles: ["swing"],
  },
  {
    id: "htf_pullback",
    name: "Trend Pullback",
    summary:
      "Established EMA21/EMA50 trend, price pulls back to EMA21 and resumes — buy-the-dip swing entry",
    styles: ["swing"],
  },
];

export const DEFAULT_ENABLED_STRATEGIES = STRATEGY_CATALOG.filter((s) =>
  s.styles.includes("day"),
)
  .map((s) => s.id)
  .join(",");

export function strategiesForStyle(style: TradeStyle): StrategyId[] {
  return STRATEGY_CATALOG.filter((s) => s.styles.includes(style)).map(
    (s) => s.id,
  );
}

interface ExitContext {
  instrument: string;
  candles: Candle[];
  atrVal: number;
  style: TradeStyle;
  minRr: number;
}

function swingLookback(style: TradeStyle): number {
  return style === "swing" ? 20 : 10;
}

function maxStopAtrMult(style: TradeStyle): number {
  return style === "swing" ? 3 : 2;
}

/** Lowest low over the last N completed bars (excludes the forming bar). */
function recentSwingLow(candles: Candle[], lookback: number): number | null {
  if (candles.length < 3) return null;
  const end = candles.length - 1; // exclude current bar
  const start = Math.max(0, end - lookback);
  const slice = candles.slice(start, end);
  if (!slice.length) return null;
  return Math.min(...slice.map((b) => b.low));
}

/** Highest high over the last N completed bars (excludes the forming bar). */
function recentSwingHigh(candles: Candle[], lookback: number): number | null {
  if (candles.length < 3) return null;
  const end = candles.length - 1;
  const start = Math.max(0, end - lookback);
  const slice = candles.slice(start, end);
  if (!slice.length) return null;
  return Math.max(...slice.map((b) => b.high));
}

/**
 * Structure-aware TP/SL: stop beyond invalidation, target at structure or min R:R.
 * ATR only clamps how wide the stop may get.
 */
export function structureExits(params: {
  instrument: string;
  candles: Candle[];
  side: "BUY" | "SELL";
  style: TradeStyle;
  atr: number;
  minRr: number;
  entry: number;
  /** Preferred invalidation level (e.g. outer band, EMA50). */
  preferredStop?: number | null;
  /** Preferred structure target (e.g. mid band, measured move). */
  preferredTarget?: number | null;
}): { takeProfit: number; stopLoss: number } {
  const {
    instrument,
    candles,
    side,
    style,
    atr: atrVal,
    entry,
  } = params;
  const minRr = Math.max(0.5, params.minRr || 1.5);
  const lookback = swingLookback(style);
  const buffer = atrVal * 0.1;
  const maxSlDist = atrVal * maxStopAtrMult(style);

  const swingLow = recentSwingLow(candles, lookback);
  const swingHigh = recentSwingHigh(candles, lookback);

  let stop: number;
  if (side === "BUY") {
    const structural =
      params.preferredStop != null && params.preferredStop < entry
        ? params.preferredStop
        : swingLow != null && swingLow < entry
          ? swingLow
          : entry - atrVal;
    stop = structural - buffer;
    // Clamp max distance
    if (entry - stop > maxSlDist) stop = entry - maxSlDist;
    // Must be below entry
    if (stop >= entry) stop = entry - Math.max(atrVal * 0.5, buffer);
  } else {
    const structural =
      params.preferredStop != null && params.preferredStop > entry
        ? params.preferredStop
        : swingHigh != null && swingHigh > entry
          ? swingHigh
          : entry + atrVal;
    stop = structural + buffer;
    if (stop - entry > maxSlDist) stop = entry + maxSlDist;
    if (stop <= entry) stop = entry + Math.max(atrVal * 0.5, buffer);
  }

  const risk = Math.abs(entry - stop);
  const minTpDist = risk * minRr;

  let target: number;
  if (side === "BUY") {
    const minTp = entry + minTpDist;
    const preferred =
      params.preferredTarget != null && params.preferredTarget > entry
        ? params.preferredTarget
        : style === "swing" && swingHigh != null && swingHigh > entry
          ? swingHigh
          : null;
    // Use structure if it clears min R:R; otherwise enforce min R:R
    target =
      preferred != null && preferred >= minTp ? preferred : minTp;
  } else {
    const minTp = entry - minTpDist;
    const preferred =
      params.preferredTarget != null && params.preferredTarget < entry
        ? params.preferredTarget
        : style === "swing" && swingLow != null && swingLow < entry
          ? swingLow
          : null;
    target =
      preferred != null && preferred <= minTp ? preferred : minTp;
  }

  return {
    stopLoss: roundPrice(stop, instrument),
    takeProfit: roundPrice(target, instrument),
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

function evalEmaCross(ctx: ExitContext): StrategySignal {
  const name = "EMA Cross + Trend";
  const c = closes(ctx.candles);
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
  const crossUp =
    (e9[p] as number) <= (e21[p] as number) &&
    (e9[i] as number) > (e21[i] as number);
  const crossDown =
    (e9[p] as number) >= (e21[p] as number) &&
    (e9[i] as number) < (e21[i] as number);
  const trendUp = entry > (e50[i] as number);
  const trendDown = entry < (e50[i] as number);

  if (crossUp && trendUp) {
    const lv = structureExits({
      instrument: ctx.instrument,
      candles: ctx.candles,
      side: "BUY",
      style: ctx.style,
      atr: ctx.atrVal,
      minRr: ctx.minRr,
      entry,
    });
    return {
      id: "ema_cross",
      name,
      bias: "BUY",
      confidence: 0.72,
      rationale: `EMA9 crossed above EMA21 with price above EMA50. Structure TP/SL from recent swing.`,
      ...lv,
      entry,
    };
  }
  if (crossDown && trendDown) {
    const lv = structureExits({
      instrument: ctx.instrument,
      candles: ctx.candles,
      side: "SELL",
      style: ctx.style,
      atr: ctx.atrVal,
      minRr: ctx.minRr,
      entry,
    });
    return {
      id: "ema_cross",
      name,
      bias: "SELL",
      confidence: 0.72,
      rationale: `EMA9 crossed below EMA21 with price below EMA50. Structure TP/SL from recent swing.`,
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

function evalRsiReversion(ctx: ExitContext): StrategySignal {
  const name = "RSI Pullback";
  const c = closes(ctx.candles);
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
  const ema50Now = e50[i] as number;

  if (trendUp && rsiPrev < 30 && rsiNow >= 30 && rsiNow < 50) {
    const withTarget = structureExits({
      instrument: ctx.instrument,
      candles: ctx.candles,
      side: "BUY",
      style: ctx.style,
      atr: ctx.atrVal,
      minRr: ctx.minRr,
      entry,
      preferredStop: ctx.candles[p].low,
      preferredTarget: ema50Now > entry ? ema50Now : null,
    });
    return {
      id: "rsi_reversion",
      name,
      bias: "BUY",
      confidence: 0.68,
      rationale: `RSI exited oversold (${rsiPrev.toFixed(1)}→${rsiNow.toFixed(1)}) above EMA50. SL beyond extreme bar; TP toward structure/EMA50.`,
      ...withTarget,
      entry,
    };
  }
  if (trendDown && rsiPrev > 70 && rsiNow <= 70 && rsiNow > 50) {
    const withTarget = structureExits({
      instrument: ctx.instrument,
      candles: ctx.candles,
      side: "SELL",
      style: ctx.style,
      atr: ctx.atrVal,
      minRr: ctx.minRr,
      entry,
      preferredStop: ctx.candles[p].high,
      preferredTarget: ema50Now < entry ? ema50Now : null,
    });
    return {
      id: "rsi_reversion",
      name,
      bias: "SELL",
      confidence: 0.68,
      rationale: `RSI exited overbought (${rsiPrev.toFixed(1)}→${rsiNow.toFixed(1)}) below EMA50. SL beyond extreme bar; TP toward structure/EMA50.`,
      ...withTarget,
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

function evalMacdCross(ctx: ExitContext): StrategySignal {
  const name = "MACD Momentum";
  const c = closes(ctx.candles);
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
    const lv = structureExits({
      instrument: ctx.instrument,
      candles: ctx.candles,
      side: "BUY",
      style: ctx.style,
      atr: ctx.atrVal,
      minRr: ctx.minRr,
      entry,
    });
    return {
      id: "macd_cross",
      name,
      bias: "BUY",
      confidence: 0.7,
      rationale: `MACD crossed above signal with positive histogram (${hist.toFixed(5)}). Structure TP/SL.`,
      ...lv,
      entry,
    };
  }
  if (crossDown && hist != null && hist < 0) {
    const lv = structureExits({
      instrument: ctx.instrument,
      candles: ctx.candles,
      side: "SELL",
      style: ctx.style,
      atr: ctx.atrVal,
      minRr: ctx.minRr,
      entry,
    });
    return {
      id: "macd_cross",
      name,
      bias: "SELL",
      confidence: 0.7,
      rationale: `MACD crossed below signal with negative histogram (${hist.toFixed(5)}). Structure TP/SL.`,
      ...lv,
      entry,
    };
  }
  return wait("macd_cross", name, entry, "No MACD signal-line cross this bar");
}

function evalBbBounce(ctx: ExitContext): StrategySignal {
  const name = "Bollinger Bounce";
  const c = closes(ctx.candles);
  const entry = c[c.length - 1];
  const bb = bollinger(c, 20, 2);
  const r = rsi(c, 14);
  const i = c.length - 1;
  const p = i - 1;
  if (bb.lower[i] == null || bb.upper[i] == null || r[i] == null) {
    return wait("bb_bounce", name, entry, "Not enough bars for Bollinger/RSI");
  }
  const lower = bb.lower[i] as number;
  const upper = bb.upper[i] as number;
  const mid = bb.mid[i] as number | null;
  const touchedLower =
    ctx.candles[i].low <= lower || ctx.candles[p].low <= (bb.lower[p] as number);
  const touchedUpper =
    ctx.candles[i].high >= upper ||
    ctx.candles[p].high >= (bb.upper[p] as number);
  const rsiNow = r[i] as number;

  if (touchedLower && rsiNow < 40 && entry > ctx.candles[p].close) {
    const lv = structureExits({
      instrument: ctx.instrument,
      candles: ctx.candles,
      side: "BUY",
      style: ctx.style,
      atr: ctx.atrVal,
      minRr: ctx.minRr,
      entry,
      preferredStop: Math.min(lower, ctx.candles[i].low, ctx.candles[p].low),
      preferredTarget: mid != null && mid > entry ? mid : null,
    });
    return {
      id: "bb_bounce",
      name,
      bias: "BUY",
      confidence: 0.65,
      rationale: `Price tagged lower Bollinger with RSI ${rsiNow.toFixed(1)}. SL beyond band; TP at mid/structure.`,
      ...lv,
      entry,
    };
  }
  if (touchedUpper && rsiNow > 60 && entry < ctx.candles[p].close) {
    const lv = structureExits({
      instrument: ctx.instrument,
      candles: ctx.candles,
      side: "SELL",
      style: ctx.style,
      atr: ctx.atrVal,
      minRr: ctx.minRr,
      entry,
      preferredStop: Math.max(upper, ctx.candles[i].high, ctx.candles[p].high),
      preferredTarget: mid != null && mid < entry ? mid : null,
    });
    return {
      id: "bb_bounce",
      name,
      bias: "SELL",
      confidence: 0.65,
      rationale: `Price tagged upper Bollinger with RSI ${rsiNow.toFixed(1)}. SL beyond band; TP at mid/structure.`,
      ...lv,
      entry,
    };
  }
  return wait(
    "bb_bounce",
    name,
    entry,
    "No Bollinger extreme + bounce confirmation",
  );
}

const DONCHIAN_PERIOD = 20;

function evalDonchianBreak(ctx: ExitContext): StrategySignal {
  const name = "Donchian Breakout";
  const c = closes(ctx.candles);
  const entry = c[c.length - 1];
  const i = ctx.candles.length - 1;
  if (ctx.candles.length < DONCHIAN_PERIOD + 55) {
    return wait(
      "donchian_break",
      name,
      entry,
      "Not enough bars for Donchian channel",
    );
  }
  const window = ctx.candles.slice(i - DONCHIAN_PERIOD, i);
  const channelHigh = Math.max(...window.map((b) => b.high));
  const channelLow = Math.min(...window.map((b) => b.low));
  const channelMid = (channelHigh + channelLow) / 2;
  const channelHeight = channelHigh - channelLow;
  const e50 = ema(c, 50);
  const emaNow = e50[i];
  if (emaNow == null) {
    return wait("donchian_break", name, entry, "Not enough bars for EMA50");
  }
  const trendUp = entry > emaNow;
  const trendDown = entry < emaNow;

  if (entry > channelHigh && trendUp) {
    const lv = structureExits({
      instrument: ctx.instrument,
      candles: ctx.candles,
      side: "BUY",
      style: ctx.style,
      atr: ctx.atrVal,
      minRr: ctx.minRr,
      entry,
      preferredStop: channelMid,
      preferredTarget: entry + channelHeight,
    });
    return {
      id: "donchian_break",
      name,
      bias: "BUY",
      confidence: 0.7,
      rationale: `Close broke above the ${DONCHIAN_PERIOD}-bar high. SL inside channel; TP measured move.`,
      ...lv,
      entry,
    };
  }
  if (entry < channelLow && trendDown) {
    const lv = structureExits({
      instrument: ctx.instrument,
      candles: ctx.candles,
      side: "SELL",
      style: ctx.style,
      atr: ctx.atrVal,
      minRr: ctx.minRr,
      entry,
      preferredStop: channelMid,
      preferredTarget: entry - channelHeight,
    });
    return {
      id: "donchian_break",
      name,
      bias: "SELL",
      confidence: 0.7,
      rationale: `Close broke below the ${DONCHIAN_PERIOD}-bar low. SL inside channel; TP measured move.`,
      ...lv,
      entry,
    };
  }
  return wait(
    "donchian_break",
    name,
    entry,
    `Price inside the ${DONCHIAN_PERIOD}-bar channel — no breakout`,
  );
}

function evalHtfPullback(ctx: ExitContext): StrategySignal {
  const name = "Trend Pullback";
  const c = closes(ctx.candles);
  const entry = c[c.length - 1];
  const i = c.length - 1;
  const p = i - 1;
  const e21 = ema(c, 21);
  const e50 = ema(c, 50);
  if (e21[i] == null || e50[i] == null || e21[p] == null) {
    return wait("htf_pullback", name, entry, "Not enough bars for EMA21/EMA50");
  }
  const ema21Now = e21[i] as number;
  const ema21Prev = e21[p] as number;
  const ema50Now = e50[i] as number;
  const uptrend = ema21Now > ema50Now && entry > ema50Now;
  const downtrend = ema21Now < ema50Now && entry < ema50Now;
  const prevBar = ctx.candles[p];
  const lookback = swingLookback(ctx.style);
  const swingHigh = recentSwingHigh(ctx.candles, lookback);
  const swingLow = recentSwingLow(ctx.candles, lookback);

  if (
    uptrend &&
    prevBar.low <= ema21Prev &&
    entry > ema21Now &&
    entry > prevBar.close
  ) {
    const lv = structureExits({
      instrument: ctx.instrument,
      candles: ctx.candles,
      side: "BUY",
      style: ctx.style,
      atr: ctx.atrVal,
      minRr: ctx.minRr,
      entry,
      preferredStop: ema50Now,
      preferredTarget:
        swingHigh != null && swingHigh > entry ? swingHigh : null,
    });
    return {
      id: "htf_pullback",
      name,
      bias: "BUY",
      confidence: 0.68,
      rationale: `Uptrend pullback to EMA21 resumed. SL beyond EMA50; TP at prior swing.`,
      ...lv,
      entry,
    };
  }
  if (
    downtrend &&
    prevBar.high >= ema21Prev &&
    entry < ema21Now &&
    entry < prevBar.close
  ) {
    const lv = structureExits({
      instrument: ctx.instrument,
      candles: ctx.candles,
      side: "SELL",
      style: ctx.style,
      atr: ctx.atrVal,
      minRr: ctx.minRr,
      entry,
      preferredStop: ema50Now,
      preferredTarget: swingLow != null && swingLow < entry ? swingLow : null,
    });
    return {
      id: "htf_pullback",
      name,
      bias: "SELL",
      confidence: 0.68,
      rationale: `Downtrend pullback to EMA21 resumed. SL beyond EMA50; TP at prior swing.`,
      ...lv,
      entry,
    };
  }
  return wait(
    "htf_pullback",
    name,
    entry,
    "No EMA21 pullback-and-resume in an established trend",
  );
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
  style?: TradeStyle;
  minRr?: number;
  /** @deprecated Ignored — exits are structure-based. Kept for call-site compat. */
  atrSlMult?: number;
  /** @deprecated Ignored — exits are structure-based. Kept for call-site compat. */
  atrTpMult?: number;
}): StrategyScanResult {
  const minVotes = params.minVotes ?? 1;
  const style: TradeStyle = params.style ?? "day";
  const minRr = params.minRr ?? 1.5;
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

  const ctx: ExitContext = {
    instrument: params.instrument,
    candles: params.candles,
    atrVal,
    style,
    minRr,
  };

  const runners: Record<StrategyId, () => StrategySignal> = {
    ema_cross: () => evalEmaCross(ctx),
    rsi_reversion: () => evalRsiReversion(ctx),
    macd_cross: () => evalMacdCross(ctx),
    bb_bounce: () => evalBbBounce(ctx),
    donchian_break: () => evalDonchianBreak(ctx),
    htf_pullback: () => evalHtfPullback(ctx),
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
    const avgTp =
      buys.reduce((a, s) => a + (s.takeProfit || 0), 0) / buys.length;
    const avgSl =
      buys.reduce((a, s) => a + (s.stopLoss || 0), 0) / buys.length;
    consensus = {
      ...best,
      bias: "BUY",
      confidence: Math.min(0.95, best.confidence + 0.05 * (buyVotes - 1)),
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
      confidence: Math.min(0.95, best.confidence + 0.05 * (sellVotes - 1)),
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

export function parseEnabledStrategies(
  csv: string | null | undefined,
  style?: TradeStyle,
): StrategyId[] {
  const all = STRATEGY_CATALOG.map((s) => s.id);
  const fallback = style ? strategiesForStyle(style) : all;
  if (!csv || !csv.trim()) return fallback;
  const wanted = csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as StrategyId[];
  const valid = wanted.filter((id) => all.includes(id));
  return valid.length ? valid : fallback;
}
