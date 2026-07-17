import { NextRequest, NextResponse } from "next/server";
import { loadCredentials } from "@/lib/credentials";
import { runBacktest } from "@/lib/backtest";
import { parseEnabledStrategies } from "@/lib/strategies";
import { laneConfig } from "@/lib/execute";
import type { CandleGranularity } from "@/lib/oanda";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { oanda, settings } = await loadCredentials();
    if (!oanda) {
      return NextResponse.json(
        { error: "OANDA not configured" },
        { status: 400 },
      );
    }
    const instrument = String(body.instrument || "EUR_USD");
    const timeframe = (body.timeframe || "H1") as CandleGranularity;
    const style = body.style === "swing" ? "swing" : "day";
    const lane = laneConfig(settings, style);
    const strategyIds = parseEnabledStrategies(
      body.strategies ? String(body.strategies) : lane.strategiesCsv,
      style,
    );

    const result = await runBacktest({
      oanda,
      instrument,
      timeframe,
      strategyIds,
      atrSlMult: lane.atrSlMult,
      atrTpMult: lane.atrTpMult,
      barCount: body.bars ? Number(body.bars) : 500,
    });

    // Trim the trade list for the response (latest 50)
    return NextResponse.json({
      ...result,
      trades: result.trades.slice(-50),
      style,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
