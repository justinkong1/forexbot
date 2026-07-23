import { NextRequest, NextResponse } from "next/server";
import { analyzeInstrument } from "@/lib/execute";
import type { CandleGranularity } from "@/lib/oanda";
import { getLimitStatus } from "@/lib/limits";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const instrument = String(body.instrument || "");
    const timeframe = (body.timeframe || "H1") as CandleGranularity;
    const style = body.style === "swing" ? "swing" : "day";
    if (!instrument) {
      return NextResponse.json({ error: "instrument required" }, { status: 400 });
    }
    const limits = await getLimitStatus();
    const result = await analyzeInstrument({ instrument, timeframe, style });
    return NextResponse.json({
      ...result,
      candles: undefined, // don't dump full candles to client again if large — include slim
      candleCount: result.candles.length,
      limits,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
