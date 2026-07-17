import { NextRequest, NextResponse } from "next/server";
import { loadCredentials } from "@/lib/credentials";
import { getCandles, type CandleGranularity } from "@/lib/oanda";
import { apiError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  try {
    const { oanda } = await loadCredentials();
    if (!oanda) {
      return NextResponse.json(
        { error: "OANDA not configured" },
        { status: 400 },
      );
    }
    const sp = req.nextUrl.searchParams;
    const instrument = sp.get("instrument") || "EUR_USD";
    const granularity = (sp.get("granularity") || "H1") as CandleGranularity;
    const count = Math.min(500, Math.max(10, Number(sp.get("count") || 100)));
    const candles = await getCandles(oanda, instrument, granularity, count);
    return NextResponse.json({ candles });
  } catch (e) {
    return apiError(e, "Failed to load candles");
  }
}
