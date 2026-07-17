import { NextRequest, NextResponse } from "next/server";
import { analyzeStrategies } from "@/lib/execute";
import type { CandleGranularity } from "@/lib/oanda";
import { getLimitStatus } from "@/lib/limits";
import { STRATEGY_CATALOG } from "@/lib/strategies";

export async function GET() {
  return NextResponse.json({ strategies: STRATEGY_CATALOG });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const instrument = String(body.instrument || "");
    const timeframe = (body.timeframe || "H1") as CandleGranularity;
    if (!instrument) {
      return NextResponse.json({ error: "instrument required" }, { status: 400 });
    }
    const limits = await getLimitStatus();
    const result = await analyzeStrategies({ instrument, timeframe });
    return NextResponse.json({ ...result, candles: undefined, limits });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
