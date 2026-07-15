import { NextResponse } from "next/server";
import { getLimitStatus } from "@/lib/limits";
import { ensureAutoTradeWorker } from "@/lib/auto-trade";

export async function GET() {
  ensureAutoTradeWorker();
  const status = await getLimitStatus();
  return NextResponse.json(status);
}
