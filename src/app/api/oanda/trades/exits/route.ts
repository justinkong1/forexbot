import { NextRequest, NextResponse } from "next/server";
import { loadCredentials } from "@/lib/credentials";
import { getOpenTrades, updateTradeExits } from "@/lib/oanda";
import { outcomeMoney, validateTpSl } from "@/lib/risk";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/api-error";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      tradeId?: string;
      takeProfit?: number | string | null;
      stopLoss?: number | string | null;
    } | null;
    if (!body?.tradeId) {
      return NextResponse.json({ error: "tradeId required" }, { status: 400 });
    }

    const { oanda, settings } = await loadCredentials();
    if (!oanda) {
      return NextResponse.json(
        { error: "OANDA not configured" },
        { status: 400 },
      );
    }

    const open = await getOpenTrades(oanda);
    const trade = open.find((t) => t.id === String(body.tradeId));
    if (!trade) {
      return NextResponse.json(
        { error: "Open trade not found" },
        { status: 404 },
      );
    }

    const entry = parseFloat(trade.price);
    const units = parseFloat(trade.currentUnits);
    if (!Number.isFinite(entry) || !Number.isFinite(units) || units === 0) {
      return NextResponse.json(
        { error: "Trade has invalid entry or units" },
        { status: 400 },
      );
    }
    const side: "BUY" | "SELL" = units < 0 ? "SELL" : "BUY";

    const currentTp = trade.takeProfitOrder?.price
      ? parseFloat(trade.takeProfitOrder.price)
      : null;
    const currentSl = trade.stopLossOrder?.price
      ? parseFloat(trade.stopLossOrder.price)
      : null;

    const hasTp = body.takeProfit != null && body.takeProfit !== "";
    const hasSl = body.stopLoss != null && body.stopLoss !== "";
    if (!hasTp && !hasSl) {
      return NextResponse.json(
        { error: "Provide takeProfit and/or stopLoss" },
        { status: 400 },
      );
    }

    const takeProfit = hasTp
      ? Number(body.takeProfit)
      : currentTp;
    const stopLoss = hasSl
      ? Number(body.stopLoss)
      : currentSl;

    if (takeProfit == null || stopLoss == null) {
      return NextResponse.json(
        {
          error:
            "Both take-profit and stop-loss are required. Set both if one is missing.",
        },
        { status: 400 },
      );
    }
    if (!Number.isFinite(takeProfit) || !Number.isFinite(stopLoss)) {
      return NextResponse.json(
        { error: "takeProfit and stopLoss must be numbers" },
        { status: 400 },
      );
    }

    const check = validateTpSl({
      side,
      entry,
      takeProfit,
      stopLoss,
      minRr: settings.minRiskReward,
    });
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }

    await updateTradeExits(oanda, trade.id, {
      instrument: trade.instrument,
      takeProfit: hasTp ? takeProfit : undefined,
      stopLoss: hasSl ? stopLoss : undefined,
    });

    // Refresh from broker so we return the prices OANDA actually has
    const refreshed = (await getOpenTrades(oanda)).find((t) => t.id === trade.id);
    const finalTp = refreshed?.takeProfitOrder?.price
      ? parseFloat(refreshed.takeProfitOrder.price)
      : takeProfit;
    const finalSl = refreshed?.stopLossOrder?.price
      ? parseFloat(refreshed.stopLossOrder.price)
      : stopLoss;

    await prisma.tradeJournal.updateMany({
      where: { oandaTradeId: trade.id, outcome: "open" },
      data: {
        takeProfit: finalTp,
        stopLoss: finalSl,
      },
    });

    const outcomes = outcomeMoney({
      units,
      entry,
      takeProfit: finalTp,
      stopLoss: finalSl,
      side,
    });

    return NextResponse.json({
      ok: true,
      tradeId: trade.id,
      instrument: trade.instrument,
      side,
      entry,
      units: Math.abs(units),
      takeProfit: finalTp,
      stopLoss: finalSl,
      youMake: outcomes.youMake,
      youLose: outcomes.youLose,
      rr: outcomes.rr,
    });
  } catch (e) {
    return apiError(e, "Failed to update trade exits");
  }
}
