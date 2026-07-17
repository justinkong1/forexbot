import { prisma } from "./db";
import { STRATEGY_CATALOG, type TradeStyle } from "./strategies";

export interface StrategyStats {
  strategyId: string;
  name: string;
  style: TradeStyle | "all";
  trades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  expectancy: number | null;
  totalPl: number;
  maxLossStreak: number;
  verdict: "profitable" | "losing" | "insufficient";
  autoDisabled: boolean;
}

const WINDOW_TRADES = 30;
/** Minimum closed trades before we judge (and can auto-disable) a strategy */
export const MIN_TRADES_TO_JUDGE = 10;

function computeFromRows(
  rows: Array<{ realizedPl: number | null; outcome: string }>,
): Omit<StrategyStats, "strategyId" | "name" | "autoDisabled" | "style"> {
  const closed = rows.filter((r) => r.realizedPl != null);
  const wins = closed.filter((r) => r.outcome === "win");
  const losses = closed.filter((r) => r.outcome === "loss");
  const breakeven = closed.length - wins.length - losses.length;

  const totalPl = closed.reduce((a, r) => a + (r.realizedPl ?? 0), 0);
  const avgWin = wins.length
    ? wins.reduce((a, r) => a + (r.realizedPl ?? 0), 0) / wins.length
    : null;
  const avgLoss = losses.length
    ? losses.reduce((a, r) => a + (r.realizedPl ?? 0), 0) / losses.length
    : null;
  const winRate = closed.length ? wins.length / closed.length : null;

  let expectancy: number | null = null;
  if (closed.length > 0) {
    expectancy = totalPl / closed.length;
  }

  let maxLossStreak = 0;
  let streak = 0;
  // rows are newest-first; streaks direction doesn't matter for a max
  for (const r of closed) {
    if (r.outcome === "loss") {
      streak += 1;
      maxLossStreak = Math.max(maxLossStreak, streak);
    } else {
      streak = 0;
    }
  }

  let verdict: "profitable" | "losing" | "insufficient" = "insufficient";
  if (closed.length >= MIN_TRADES_TO_JUDGE) {
    verdict = (expectancy ?? 0) > 0 ? "profitable" : "losing";
  }

  return {
    trades: closed.length,
    wins: wins.length,
    losses: losses.length,
    breakeven,
    winRate,
    avgWin,
    avgLoss,
    expectancy,
    totalPl,
    maxLossStreak,
    verdict,
  };
}

/**
 * Per-strategy stats over the most recent closed trades (windowed).
 * When a style is given, only trades of that style count — a strategy
 * can be benched for day trading but stay live for swing.
 */
export async function getStrategyStats(params?: {
  autoDisableEnabled?: boolean;
  style?: TradeStyle;
}): Promise<StrategyStats[]> {
  const autoDisable = params?.autoDisableEnabled ?? true;
  const style = params?.style;
  const ids = [...STRATEGY_CATALOG.map((s) => s.id), "ai"] as string[];
  const out: StrategyStats[] = [];

  for (const id of ids) {
    const rows = await prisma.tradeJournal.findMany({
      where: {
        outcome: { in: ["win", "loss", "breakeven"] },
        realizedPl: { not: null },
        ...(style ? { style } : {}),
        OR: [
          { strategyId: id },
          // Legacy rows without strategyId: attribute AI rows by source
          ...(id === "ai"
            ? [{ strategyId: null, source: { in: ["auto", "manual"] } }]
            : []),
        ],
      },
      orderBy: [{ closedAt: "desc" }, { updatedAt: "desc" }],
      take: WINDOW_TRADES,
      select: { realizedPl: true, outcome: true },
    });

    const catalog = STRATEGY_CATALOG.find((s) => s.id === id);
    const base = computeFromRows(rows);
    out.push({
      strategyId: id,
      name: catalog?.name || (id === "ai" ? "Gemini AI" : id),
      ...base,
      style: style ?? "all",
      autoDisabled: autoDisable && base.verdict === "losing",
    });
  }

  return out;
}

/** Strategy ids the auto-trade worker should skip right now (per lane) */
export async function getDisabledStrategyIds(
  style?: TradeStyle,
): Promise<string[]> {
  const stats = await getStrategyStats({ autoDisableEnabled: true, style });
  return stats
    .filter((s) => s.autoDisabled && s.strategyId !== "ai")
    .map((s) => s.strategyId);
}

/** Overall account stats for the dashboard */
export async function getOverallStats() {
  const rows = await prisma.tradeJournal.findMany({
    where: {
      outcome: { in: ["win", "loss", "breakeven"] },
      realizedPl: { not: null },
    },
    orderBy: [{ closedAt: "desc" }, { updatedAt: "desc" }],
    take: 100,
    select: { realizedPl: true, outcome: true },
  });
  return computeFromRows(rows);
}
