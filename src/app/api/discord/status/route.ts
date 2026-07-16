import { NextResponse } from "next/server";
import { loadCredentials } from "@/lib/credentials";
import { getAccountSummary, getOpenTrades } from "@/lib/oanda";
import { notifyTradeStatus } from "@/lib/discord";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      tradeId?: string;
    };
    const { oanda, discordWebhook } = await loadCredentials();
    if (!oanda) {
      return NextResponse.json(
        { error: "OANDA not configured" },
        { status: 400 },
      );
    }
    if (!discordWebhook) {
      return NextResponse.json(
        { error: "Discord webhook not configured in Settings" },
        { status: 400 },
      );
    }

    const [trades, account] = await Promise.all([
      getOpenTrades(oanda),
      getAccountSummary(oanda),
    ]);

    if (!trades.length) {
      return NextResponse.json(
        { error: "No open trade to share" },
        { status: 400 },
      );
    }

    const trade = body.tradeId
      ? trades.find((t) => t.id === body.tradeId)
      : trades[0];

    if (!trade) {
      return NextResponse.json(
        { error: "Trade not found / not open" },
        { status: 404 },
      );
    }

    const units = parseFloat(trade.currentUnits);
    const side = units >= 0 ? "BUY" : "SELL";
    const entry = parseFloat(trade.price);
    const upl = parseFloat(trade.unrealizedPL);
    const tp = trade.takeProfitOrder?.price
      ? parseFloat(trade.takeProfitOrder.price)
      : null;
    const sl = trade.stopLossOrder?.price
      ? parseFloat(trade.stopLossOrder.price)
      : null;

    const journal = await prisma.tradeJournal.findFirst({
      where: {
        OR: [
          { oandaTradeId: trade.id },
          {
            instrument: trade.instrument,
            outcome: "open",
          },
        ],
      },
      orderBy: { createdAt: "desc" },
    });

    // Approximate mark from entry + uPL/units when possible
    let currentPrice: number | null = null;
    if (Math.abs(units) > 0) {
      currentPrice = entry + upl / Math.abs(units);
    }

    await notifyTradeStatus(discordWebhook, {
      instrument: trade.instrument,
      side,
      units: Math.abs(units),
      entryPrice: entry,
      currentPrice,
      unrealizedPl: upl,
      takeProfit: tp,
      stopLoss: sl,
      openTime: trade.openTime,
      timeframe: journal?.timeframe,
      source: journal?.source,
      confidence: journal?.confidence,
      rationale: journal?.rationale,
      oandaTradeId: trade.id,
      balance: parseFloat(String(account.balance ?? 0)),
      nav: parseFloat(String(account.NAV ?? 0)),
      currency: String(account.currency || ""),
    });

    return NextResponse.json({
      ok: true,
      tradeId: trade.id,
      instrument: trade.instrument,
      unrealizedPl: upl,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
