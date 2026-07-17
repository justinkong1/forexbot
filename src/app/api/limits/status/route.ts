import { NextResponse } from "next/server";
import { getLimitStatus } from "@/lib/limits";
import { ensureAutoTradeWorker } from "@/lib/auto-trade";
import { apiError } from "@/lib/api-error";

export async function GET() {
  try {
    ensureAutoTradeWorker();
    const status = await getLimitStatus();
    return NextResponse.json(status);
  } catch (e) {
    return apiError(e, "Failed to load limits");
  }
}
