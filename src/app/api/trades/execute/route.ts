import { NextRequest, NextResponse } from "next/server";
import { executeTrade } from "@/lib/execute";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const side = body.side as "BUY" | "SELL";
    if (side !== "BUY" && side !== "SELL") {
      return NextResponse.json({ error: "side must be BUY or SELL" }, { status: 400 });
    }
    const source =
      body.source === "strategy" || body.source === "auto"
        ? body.source
        : "manual";
    const result = await executeTrade({
      source,
      instrument: String(body.instrument),
      timeframe: String(body.timeframe || "H1"),
      side,
      units: body.units != null ? Number(body.units) : undefined,
      takeProfit: Number(body.takeProfit),
      stopLoss: Number(body.stopLoss),
      confidence:
        body.confidence != null ? Number(body.confidence) : undefined,
      rationale: body.rationale ? String(body.rationale) : undefined,
      entryPrice: body.entryPrice != null ? Number(body.entryPrice) : undefined,
      strategyId: body.strategyId ? String(body.strategyId) : undefined,
    });
    return NextResponse.json({
      ok: true,
      journal: result.journal,
      fillPrice: result.fillPrice,
      units: result.units,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
