import { NextResponse } from "next/server";
import { loadCredentials } from "@/lib/credentials";
import { getOpenPositions, getOpenTrades } from "@/lib/oanda";

export async function GET() {
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
}
