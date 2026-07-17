import { prisma, getOrCreateSettings } from "./db";
import { loadCredentials } from "./credentials";
import { getAccountSummary } from "./oanda";
import { notifyHalt } from "./discord";

export type HaltReason =
  | "daily_loss"
  | "daily_win"
  | "weekly_loss"
  | "weekly_win"
  | "drawdown"
  | "loss_streak"
  | "cooldown"
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
  nav: number | null;
  peakEquity: number | null;
  drawdownPct: number | null;
  maxDrawdownPercent: number | null;
  lossStreak: number;
  lossStreakHalt: number | null;
  haltedUntil: string | null;
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

/** Sum realized P/L from journal fills closed in range */
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

/** Consecutive losses among the most recent closed trades */
export async function currentLossStreak(): Promise<number> {
  const rows = await prisma.tradeJournal.findMany({
    where: { outcome: { in: ["win", "loss", "breakeven"] } },
    orderBy: [{ closedAt: "desc" }, { updatedAt: "desc" }],
    take: 30,
    select: { outcome: true },
  });
  let streak = 0;
  for (const r of rows) {
    if (r.outcome === "loss") streak += 1;
    else break;
  }
  return streak;
}

/** Fetch NAV and ratchet peak equity up; returns { nav, peak } (nulls if OANDA unavailable) */
async function updatePeakEquity(): Promise<{
  nav: number | null;
  peak: number | null;
}> {
  try {
    const { oanda, settings } = await loadCredentials();
    if (!oanda) return { nav: null, peak: settings.peakEquity ?? null };
    const account = await getAccountSummary(oanda);
    const nav = parseFloat(String(account.NAV ?? account.balance ?? 0));
    if (!Number.isFinite(nav) || nav <= 0) {
      return { nav: null, peak: settings.peakEquity ?? null };
    }
    let peak = settings.peakEquity ?? null;
    if (peak == null || nav > peak) {
      peak = nav;
      await prisma.settings.update({
        where: { id: "default" },
        data: { peakEquity: peak },
      });
    }
    return { nav, peak };
  } catch {
    const settings = await getOrCreateSettings();
    return { nav: null, peak: settings.peakEquity ?? null };
  }
}

// Avoid Discord spam: only notify when the halt reason changes
let lastNotifiedReason: HaltReason = null;

async function maybeNotifyHalt(reason: HaltReason, message: string | null) {
  if (!reason || reason === lastNotifiedReason) return;
  lastNotifiedReason = reason;
  try {
    const { discordWebhook } = await loadCredentials();
    await notifyHalt(discordWebhook, message || "Trading halted");
  } catch {
    // non-fatal
  }
}

export async function getLimitStatus(): Promise<LimitStatus> {
  const settings = await getOrCreateSettings();
  const dayStart = startOfUtcDay();
  const weekStart = startOfUtcWeek();
  const dayPl = await realizedPlSince(dayStart);
  const weekPl = await realizedPlSince(weekStart);
  const lossStreak = await currentLossStreak();
  const { nav, peak } = await updatePeakEquity();

  const dailyMaxLoss = settings.dailyMaxLoss;
  const dailyMaxWin = settings.dailyMaxWin;
  const weeklyMaxLoss = settings.weeklyMaxLoss;
  const weeklyMaxWin = settings.weeklyMaxWin;
  const maxDrawdownPercent = settings.maxDrawdownPercent;
  const lossStreakHalt = settings.lossStreakHalt;

  let drawdownPct: number | null = null;
  if (nav != null && peak != null && peak > 0) {
    drawdownPct = ((peak - nav) / peak) * 100;
  }

  let reason: HaltReason = null;
  let message: string | null = null;

  const now = new Date();
  const haltedUntil = settings.haltedUntil;

  if (dailyMaxLoss != null && dayPl <= -Math.abs(dailyMaxLoss)) {
    reason = "daily_loss";
    message = `Daily loss limit hit (${dayPl.toFixed(2)} ≤ -${Math.abs(dailyMaxLoss)})`;
  } else if (dailyMaxWin != null && dayPl >= Math.abs(dailyMaxWin)) {
    reason = "daily_win";
    message = `Daily win limit hit (${dayPl.toFixed(2)} ≥ ${Math.abs(dailyMaxWin)}) — banking the win`;
  } else if (weeklyMaxLoss != null && weekPl <= -Math.abs(weeklyMaxLoss)) {
    reason = "weekly_loss";
    message = `Weekly loss limit hit (${weekPl.toFixed(2)} ≤ -${Math.abs(weeklyMaxLoss)})`;
  } else if (weeklyMaxWin != null && weekPl >= Math.abs(weeklyMaxWin)) {
    reason = "weekly_win";
    message = `Weekly win limit hit (${weekPl.toFixed(2)} ≥ ${Math.abs(weeklyMaxWin)}) — banking the win`;
  } else if (
    maxDrawdownPercent != null &&
    drawdownPct != null &&
    drawdownPct >= maxDrawdownPercent
  ) {
    reason = "drawdown";
    message = `Account is ${drawdownPct.toFixed(1)}% below its peak (${peak?.toFixed(2)}). Trading paused to protect what's left.`;
  } else if (
    lossStreakHalt != null &&
    lossStreak >= lossStreakHalt
  ) {
    reason = "loss_streak";
    message = `${lossStreak} losses in a row — taking a mandatory break.`;
  } else if (haltedUntil && haltedUntil.getTime() > now.getTime()) {
    reason = "cooldown";
    const mins = Math.ceil((haltedUntil.getTime() - now.getTime()) / 60_000);
    message = `Cooling down after a halt — trading resumes in ~${mins} min.`;
  }

  // Start/refresh the cooldown when a hard halt (not cooldown itself) trips
  if (reason && reason !== "cooldown") {
    const cooldownMs = Math.max(0, settings.haltCooldownMinutes) * 60_000;
    if (cooldownMs > 0) {
      const until = new Date(now.getTime() + cooldownMs);
      if (!haltedUntil || haltedUntil.getTime() < until.getTime()) {
        await prisma.settings.update({
          where: { id: "default" },
          data: { haltedUntil: until },
        });
      }
    }
    await maybeNotifyHalt(reason, message);
  } else if (!reason) {
    lastNotifiedReason = null;
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
    nav,
    peakEquity: peak,
    drawdownPct,
    maxDrawdownPercent,
    lossStreak,
    lossStreakHalt,
    haltedUntil: settings.haltedUntil ? settings.haltedUntil.toISOString() : null,
  };
}

export async function assertTradingAllowed() {
  const status = await getLimitStatus();
  if (status.halted) {
    throw new Error(status.message || "Trading halted by circuit breaker");
  }
  return status;
}
