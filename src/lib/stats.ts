import { prisma } from "./db";
import { STRATEGY_CATALOG } from "./strategies";

export interface StrategyStats {
  strategyId: string;
  name: string;
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
): Omit<StrategyStats, "strategyId" | "name" | "autoDisabled"> {
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

/** Per-strategy stats over the most recent closed trades (windowed) */
export async function getStrategyStats(params?: {
  autoDisableEnabled?: boolean;
}): Promise<StrategyStats[]> {
  const autoDisable = params?.autoDisableEnabled ?? true;
  const ids = [...STRATEGY_CATALOG.map((s) => s.id), "ai"] as string[];
  const out: StrategyStats[] = [];

  for (const id of ids) {
    const rows = await prisma.tradeJournal.findMany({
      where: {
        outcome: { in: ["win", "loss", "breakeven"] },
        realizedPl: { not: null },
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
      autoDisabled: autoDisable && base.verdict === "losing",
    });
  }

  return out;
}

/** Strategy ids the auto-trade worker should skip right now */
export async function getDisabledStrategyIds(): Promise<string[]> {
  const stats = await getStrategyStats({ autoDisableEnabled: true });
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
