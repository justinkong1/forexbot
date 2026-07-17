import { NextResponse } from "next/server";
import {
  ensureAutoTradeWorker,
  getAutoTradeRuntime,
  triggerAutoTradeNow,
} from "@/lib/auto-trade";
import { getOrCreateSettings, prisma } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { laneConfig } from "@/lib/execute";

export async function GET() {
  try {
    ensureAutoTradeWorker();
    const settings = await getOrCreateSettings();
    const day = laneConfig(settings, "day");
    const swing = laneConfig(settings, "swing");
    const openByStyle = await prisma.tradeJournal.groupBy({
      by: ["style"],
      where: { outcome: "open" },
      _count: { _all: true },
    });
    const openCount = (style: string) =>
      openByStyle.find((r) => r.style === style)?._count._all ?? 0;
    return NextResponse.json({
      enabled: settings.autoTradeEnabled,
      watchlist: settings.autoWatchlist,
      timeframe: settings.autoTimeframe,
      intervalMinutes: settings.autoIntervalMinutes,
      minConfidence: settings.autoMinConfidence,
      runtime: getAutoTradeRuntime(),
      lanes: {
        day: {
          enabled: day.enabled,
          timeframe: day.timeframe,
          intervalMinutes: day.intervalMinutes,
          watchlist: day.watchlist,
          maxOpenTrades: day.maxOpenTrades,
          openTrades: openCount("day"),
        },
        swing: {
          enabled: swing.enabled,
          timeframe: swing.timeframe,
          intervalMinutes: swing.intervalMinutes,
          watchlist: swing.watchlist,
          maxOpenTrades: swing.maxOpenTrades,
          openTrades: openCount("swing"),
        },
      },
    });
  } catch (e) {
    return apiError(e, "Failed to load auto-trade status");
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    if (body.action === "run_now") {
      ensureAutoTradeWorker();
      const runtime = await triggerAutoTradeNow();
      return NextResponse.json({ ok: true, runtime });
    }
    if (body.action === "toggle") {
      const s = await getOrCreateSettings();
      const enabled = body.enabled != null ? !!body.enabled : !s.autoTradeEnabled;
      if (enabled && s.oandaEnv === "live" && !s.liveAutoAcknowledged) {
        return NextResponse.json(
          { error: "Acknowledge live auto-trade in Settings first" },
          { status: 400 },
        );
      }
      await prisma.settings.update({
        where: { id: "default" },
        data: { autoTradeEnabled: enabled },
      });
      ensureAutoTradeWorker();
      return NextResponse.json({ ok: true, enabled });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return apiError(e, "Auto-trade request failed");
  }
}
