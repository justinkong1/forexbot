import { prisma } from "./db";
import { loadCredentials } from "./credentials";
import { getClosedTradesSince } from "./oanda";
import { postTradeLesson } from "./ai";
import { notifyTradeClosed } from "./discord";

/** Match OANDA closed trades to open journal rows and update P/L */
export async function syncClosedTrades() {
  const { oanda, geminiKey, settings, discordWebhook } =
    await loadCredentials();
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
          model: settings.geminiModel,
        });
      } catch {
        lesson = null;
      }
    }

    const closePrice = t.averageClosePrice
      ? parseFloat(t.averageClosePrice)
      : null;
    const closedAt = t.closeTime ? new Date(t.closeTime) : new Date();

    await prisma.tradeJournal.update({
      where: { id: row.id },
      data: {
        outcome,
        realizedPl: pl,
        closedAt,
        lesson,
      },
    });

    await notifyTradeClosed(discordWebhook, {
      source: row.source,
      instrument: row.instrument,
      side: row.side,
      units: row.units,
      entryPrice: row.entryPrice,
      takeProfit: row.takeProfit,
      stopLoss: row.stopLoss,
      timeframe: row.timeframe,
      realizedPl: pl,
      outcome,
      openTime: row.createdAt,
      closeTime: closedAt,
      closePrice,
      oandaTradeId: row.oandaTradeId,
      rationale: row.rationale,
      lesson,
      confidence: row.confidence,
    });

    updated += 1;
  }

  return { updated };
}
