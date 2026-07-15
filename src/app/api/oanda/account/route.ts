import { NextResponse } from "next/server";
import { loadCredentials } from "@/lib/credentials";
import { getAccountSummary } from "@/lib/oanda";
import { ensureAutoTradeWorker } from "@/lib/auto-trade";

export async function GET() {
  ensureAutoTradeWorker();
  const { oanda } = await loadCredentials();
  if (!oanda) {
    return NextResponse.json(
      { error: "OANDA not configured" },
      { status: 400 },
    );
  }
  const account = await getAccountSummary(oanda);
  return NextResponse.json({
    balance: account.balance,
    NAV: account.NAV,
    unrealizedPL: account.unrealizedPL,
    currency: account.currency,
    openTradeCount: account.openTradeCount,
    openPositionCount: account.openPositionCount,
    marginUsed: account.marginUsed,
    marginAvailable: account.marginAvailable,
    alias: account.alias,
    id: account.id,
  });
}
