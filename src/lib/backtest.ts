import type { Candle, CandleGranularity, OandaCredentials } from "./oanda";
import { getCandles } from "./oanda";
import {
  scanStrategies,
  STRATEGY_CATALOG,
  type StrategyId,
} from "./strategies";

export interface BacktestTrade {
  strategyId: StrategyId;
  side: "BUY" | "SELL";
  entryTime: string;
  entryPrice: number;
  takeProfit: number;
  stopLoss: number;
  exitTime: string | null;
  resultR: number; // +reward/risk on win, -1 on loss, 0 if never resolved
  outcome: "win" | "loss" | "open";
}

export interface StrategyBacktestStats {
  strategyId: StrategyId;
  name: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  totalR: number;
  expectancyR: number | null;
  profitFactor: number | null;
  maxDrawdownR: number;
  verdict: "profitable" | "losing" | "insufficient";
}

export interface BacktestResult {
  instrument: string;
  timeframe: string;
  bars: number;
  from: string | null;
  to: string | null;
  strategies: StrategyBacktestStats[];
  trades: BacktestTrade[];
}

const WARMUP_BARS = 60;

/**
 * Simulate TP/SL resolution from bar index onward.
 * Conservative: if a bar touches both TP and SL, count it as a loss.
 */
function resolveTrade(
  candles: Candle[],
  fromIdx: number,
  side: "BUY" | "SELL",
  tp: number,
  sl: number,
): { outcome: "win" | "loss" | "open"; exitIdx: number | null } {
  for (let i = fromIdx; i < candles.length; i++) {
    const bar = candles[i];
    const hitTp = side === "BUY" ? bar.high >= tp : bar.low <= tp;
    const hitSl = side === "BUY" ? bar.low <= sl : bar.high >= sl;
    if (hitTp && hitSl) return { outcome: "loss", exitIdx: i };
    if (hitSl) return { outcome: "loss", exitIdx: i };
    if (hitTp) return { outcome: "win", exitIdx: i };
  }
  return { outcome: "open", exitIdx: null };
}

export async function runBacktest(params: {
  oanda: OandaCredentials;
  instrument: string;
  timeframe: CandleGranularity;
  strategyIds: StrategyId[];
  atrSlMult: number;
  atrTpMult: number;
  barCount?: number;
}): Promise<BacktestResult> {
  const count = Math.min(500, Math.max(120, params.barCount ?? 500));
  const candles = await getCandles(
    params.oanda,
    params.instrument,
    params.timeframe,
    count,
  );

  const trades: BacktestTrade[] = [];
  // Track an open simulated trade per strategy so we don't overlap entries
  const openUntil: Partial<Record<StrategyId, number>> = {};

  for (let i = WARMUP_BARS; i < candles.length - 1; i++) {
    const window = candles.slice(0, i + 1);
    const scan = scanStrategies({
      instrument: params.instrument,
      candles: window,
      enabledIds: params.strategyIds,
      minVotes: 1, // evaluate each strategy on its own merits
      atrSlMult: params.atrSlMult,
      atrTpMult: params.atrTpMult,
    });

    for (const signal of scan.signals) {
      if (signal.bias === "WAIT") continue;
      if (signal.takeProfit == null || signal.stopLoss == null) continue;
      const blockedUntil = openUntil[signal.id];
      if (blockedUntil != null && i <= blockedUntil) continue;

      // Enter at next bar open (no lookahead)
      const entryBar = candles[i + 1];
      const entry = entryBar.open;
      const tp = signal.takeProfit;
      const sl = signal.stopLoss;
      const risk = Math.abs(entry - sl);
      const reward = Math.abs(tp - entry);
      if (risk <= 0) continue;

      const resolved = resolveTrade(candles, i + 1, signal.bias, tp, sl);
      const rr = reward / risk;
      const resultR =
        resolved.outcome === "win" ? rr : resolved.outcome === "loss" ? -1 : 0;

      trades.push({
        strategyId: signal.id,
        side: signal.bias,
        entryTime: entryBar.time,
        entryPrice: entry,
        takeProfit: tp,
        stopLoss: sl,
        exitTime:
          resolved.exitIdx != null ? candles[resolved.exitIdx].time : null,
        resultR,
        outcome: resolved.outcome,
      });

      openUntil[signal.id] =
        resolved.exitIdx != null ? resolved.exitIdx : candles.length;
    }
  }

  const strategies: StrategyBacktestStats[] = params.strategyIds.map((id) => {
    const catalog = STRATEGY_CATALOG.find((s) => s.id === id);
    const mine = trades.filter(
      (t) => t.strategyId === id && t.outcome !== "open",
    );
    const wins = mine.filter((t) => t.outcome === "win");
    const losses = mine.filter((t) => t.outcome === "loss");
    const totalR = mine.reduce((a, t) => a + t.resultR, 0);
    const grossWin = wins.reduce((a, t) => a + t.resultR, 0);
    const grossLoss = Math.abs(losses.reduce((a, t) => a + t.resultR, 0));

    let equity = 0;
    let peak = 0;
    let maxDd = 0;
    for (const t of mine) {
      equity += t.resultR;
      peak = Math.max(peak, equity);
      maxDd = Math.max(maxDd, peak - equity);
    }

    let verdict: "profitable" | "losing" | "insufficient" = "insufficient";
    if (mine.length >= 5) {
      verdict = totalR > 0 ? "profitable" : "losing";
    }

    return {
      strategyId: id,
      name: catalog?.name || id,
      trades: mine.length,
      wins: wins.length,
      losses: losses.length,
      winRate: mine.length ? wins.length / mine.length : null,
      totalR: Math.round(totalR * 100) / 100,
      expectancyR: mine.length
        ? Math.round((totalR / mine.length) * 100) / 100
        : null,
      profitFactor:
        grossLoss > 0
          ? Math.round((grossWin / grossLoss) * 100) / 100
          : grossWin > 0
            ? Infinity
            : null,
      maxDrawdownR: Math.round(maxDd * 100) / 100,
      verdict,
    };
  });

  return {
    instrument: params.instrument,
    timeframe: params.timeframe,
    bars: candles.length,
    from: candles[0]?.time ?? null,
    to: candles[candles.length - 1]?.time ?? null,
    strategies,
    trades,
  };
}
