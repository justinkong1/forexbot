import { prisma } from "./db";
import { loadCredentials } from "./credentials";
import { getClosedTradesSince } from "./oanda";
import { postTradeLesson } from "./ai";

/** Match OANDA closed trades to open journal rows and update P/L */
export async function syncClosedTrades() {
  const { oanda, geminiKey } = await loadCredentials();
  if (!oanda) return { updated: 0 };

  const openRows = await prisma.tradeJournal.findMany({
    where: { outcome: "open", oandaTradeId: { not: null } },
  });
  if (openRows.length === 0) return { updated: 0 };

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const closed = await getClosedTradesSince(oanda, since);
  const byId = new Map(closed.map((t) => [t.id, t]));

  let updated = 0;
  for (const row of openRows) {
    if (!row.oandaTradeId) continue;
    const t = byId.get(row.oandaTradeId);
    if (!t) continue;
    const pl = parseFloat(t.realizedPL);
    let outcome: "win" | "loss" | "breakeven" = "breakeven";
    if (pl > 0.01) outcome = "win";
    else if (pl < -0.01) outcome = "loss";

    let lesson: string | null = null;
    if (geminiKey) {
      try {
        lesson = await postTradeLesson({
          apiKey: geminiKey,
          instrument: row.instrument,
          side: row.side || "",
          realizedPl: pl,
          rationale: row.rationale,
        });
      } catch {
        lesson = null;
      }
    }

    await prisma.tradeJournal.update({
      where: { id: row.id },
      data: {
        outcome,
        realizedPl: pl,
        closedAt: t.closeTime ? new Date(t.closeTime) : new Date(),
        lesson,
      },
    });
    updated += 1;
  }

  return { updated };
}
