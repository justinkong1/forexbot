import { prisma, getOrCreateSettings } from "./db";

export type HaltReason =
  | "daily_loss"
  | "daily_win"
  | "weekly_loss"
  | "weekly_win"
  | null;

export interface LimitStatus {
  halted: boolean;
  reason: HaltReason;
  message: string | null;
  dayPl: number;
  weekPl: number;
  dailyMaxLoss: number | null;
  dailyMaxWin: number | null;
  weeklyMaxLoss: number | null;
  weeklyMaxWin: number | null;
  dayStart: string;
  weekStart: string;
}

function startOfUtcDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function startOfUtcWeek(d = new Date()): Date {
  const day = startOfUtcDay(d);
  // Monday-based week
  const dow = day.getUTCDay(); // 0 Sun .. 6 Sat
  const offset = dow === 0 ? 6 : dow - 1;
  day.setUTCDate(day.getUTCDate() - offset);
  return day;
}

/** Sum realized P/L from journal fills closed in range (or created if closedAt missing for skips ignored) */
export async function realizedPlSince(since: Date): Promise<number> {
  const rows = await prisma.tradeJournal.findMany({
    where: {
      realizedPl: { not: null },
      OR: [
        { closedAt: { gte: since } },
        { closedAt: null, updatedAt: { gte: since }, outcome: { in: ["win", "loss", "breakeven"] } },
      ],
    },
    select: { realizedPl: true },
  });
  return rows.reduce((sum, r) => sum + (r.realizedPl ?? 0), 0);
}

export async function getLimitStatus(): Promise<LimitStatus> {
  const settings = await getOrCreateSettings();
  const dayStart = startOfUtcDay();
  const weekStart = startOfUtcWeek();
  const dayPl = await realizedPlSince(dayStart);
  const weekPl = await realizedPlSince(weekStart);

  const dailyMaxLoss = settings.dailyMaxLoss;
  const dailyMaxWin = settings.dailyMaxWin;
  const weeklyMaxLoss = settings.weeklyMaxLoss;
  const weeklyMaxWin = settings.weeklyMaxWin;

  let reason: HaltReason = null;
  let message: string | null = null;

  if (dailyMaxLoss != null && dayPl <= -Math.abs(dailyMaxLoss)) {
    reason = "daily_loss";
    message = `Daily loss limit hit (${dayPl.toFixed(2)} ≤ -${Math.abs(dailyMaxLoss)})`;
  } else if (dailyMaxWin != null && dayPl >= Math.abs(dailyMaxWin)) {
    reason = "daily_win";
    message = `Daily win limit hit (${dayPl.toFixed(2)} ≥ ${Math.abs(dailyMaxWin)})`;
  } else if (weeklyMaxLoss != null && weekPl <= -Math.abs(weeklyMaxLoss)) {
    reason = "weekly_loss";
    message = `Weekly loss limit hit (${weekPl.toFixed(2)} ≤ -${Math.abs(weeklyMaxLoss)})`;
  } else if (weeklyMaxWin != null && weekPl >= Math.abs(weeklyMaxWin)) {
    reason = "weekly_win";
    message = `Weekly win limit hit (${weekPl.toFixed(2)} ≥ ${Math.abs(weeklyMaxWin)})`;
  }

  return {
    halted: reason != null,
    reason,
    message,
    dayPl,
    weekPl,
    dailyMaxLoss,
    dailyMaxWin,
    weeklyMaxLoss,
    weeklyMaxWin,
    dayStart: dayStart.toISOString(),
    weekStart: weekStart.toISOString(),
  };
}

export async function assertTradingAllowed() {
  const status = await getLimitStatus();
  if (status.halted) {
    throw new Error(status.message || "Trading halted by circuit breaker");
  }
  return status;
}
