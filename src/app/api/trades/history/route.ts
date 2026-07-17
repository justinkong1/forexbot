import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { syncClosedTrades } from "@/lib/sync";
import { apiError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  try {
    await syncClosedTrades();
    const sp = req.nextUrl.searchParams;
    const source = sp.get("source");
    const outcome = sp.get("outcome");
    const instrument = sp.get("instrument");
    const style = sp.get("style");
    const from = sp.get("from");
    const to = sp.get("to");

    const where: Record<string, unknown> = {};
    if (source) where.source = source;
    if (outcome) where.outcome = outcome;
    if (instrument) where.instrument = instrument;
    if (style === "day" || style === "swing") where.style = style;
    if (from || to) {
      where.createdAt = {};
      if (from)
        (where.createdAt as Record<string, Date>).gte = new Date(from);
      if (to) (where.createdAt as Record<string, Date>).lte = new Date(to);
    }

    const rows = await prisma.tradeJournal.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json({ trades: rows });
  } catch (e) {
    return apiError(e, "Failed to load history");
  }
}
