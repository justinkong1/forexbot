import { NextResponse } from "next/server";
import {
  ensureAutoTradeWorker,
  getAutoTradeRuntime,
  triggerAutoTradeNow,
} from "@/lib/auto-trade";
import { getOrCreateSettings, prisma } from "@/lib/db";
import { apiError } from "@/lib/api-error";

export async function GET() {
  try {
    ensureAutoTradeWorker();
    const settings = await getOrCreateSettings();
    return NextResponse.json({
      enabled: settings.autoTradeEnabled,
      watchlist: settings.autoWatchlist,
      timeframe: settings.autoTimeframe,
      intervalMinutes: settings.autoIntervalMinutes,
      minConfidence: settings.autoMinConfidence,
      runtime: getAutoTradeRuntime(),
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
