import { NextResponse } from "next/server";
import { loadCredentials } from "@/lib/credentials";
import { getOpenPositions, getOpenTrades } from "@/lib/oanda";
import { apiError } from "@/lib/api-error";

export async function GET() {
  try {
    const { oanda } = await loadCredentials();
    if (!oanda) {
      return NextResponse.json(
        { error: "OANDA not configured" },
        { status: 400 },
      );
    }
    const [positions, trades] = await Promise.all([
      getOpenPositions(oanda),
      getOpenTrades(oanda),
    ]);
    return NextResponse.json({ positions, trades });
  } catch (e) {
    return apiError(e, "Failed to load positions");
  }
}
