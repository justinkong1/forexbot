const SITE_URL = "https://kostintrades.xyz";
const SITE_HOST = "kostintrades.xyz";
const AD_LINE =
  `Trade with Kostin Trades · AI + strategy forex desk → ${SITE_URL}`;
const AD_FIELD = {
  name: "Trade live with us",
  value: `**[kostintrades.xyz](${SITE_URL})** — open the desk, connect OANDA, and run the same strategies.`,
  inline: false as const,
};

export async function sendDiscord(
  webhookUrl: string | null | undefined,
  content: string,
) {
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `${AD_LINE}\n${content}`.slice(0, 1900),
      }),
    });
  } catch {
    // non-fatal
  }
}

type EmbedField = { name: string; value: string; inline?: boolean };

async function sendDiscordEmbed(
  webhookUrl: string | null | undefined,
  embed: {
    title: string;
    description?: string;
    color: number;
    fields: EmbedField[];
    footer?: string;
  },
) {
  if (!webhookUrl) return;
  try {
    const fields = [...embed.fields, AD_FIELD].slice(0, 25);
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // Plain text above the embed so the site is always visible
        content: AD_LINE,
        embeds: [
          {
            title: embed.title.slice(0, 256),
            description: embed.description?.slice(0, 4000),
            url: SITE_URL,
            color: embed.color,
            fields: fields.map((f) => ({
              name: f.name.slice(0, 256),
              value: (f.value || "—").slice(0, 1024),
              inline: f.inline ?? true,
            })),
            footer: {
              text: `${embed.footer || "Kostin Trades"} · ${SITE_HOST}`.slice(
                0,
                2048,
              ),
            },
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
  } catch {
    // non-fatal
  }
}

const COLOR_BUY = 0x1f7a4d;
const COLOR_SELL = 0xb83a3a;
const COLOR_WIN = 0x1a9b8e;
const COLOR_LOSS = 0x9a3412;
const COLOR_FLAT = 0x3a5258;
const COLOR_HALT = 0xc9782c;

function fmt(n: number | null | undefined, digits = 5): string {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toFixed(digits);
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}`;
}

function pairDigits(instrument: string): number {
  return instrument.includes("JPY") ? 3 : 5;
}

export async function notifyTradeOpened(
  webhookUrl: string | null | undefined,
  trade: {
    source: string;
    instrument: string;
    side: string;
    units: number;
    entryPrice: number;
    takeProfit: number;
    stopLoss: number;
    timeframe?: string | null;
    confidence?: number | null;
    rationale?: string | null;
    oandaTradeId?: string | null;
    oandaOrderId?: string | null;
    riskAmount?: number | null;
    rewardAmount?: number | null;
    rr?: number | null;
    balance?: number | null;
    sizingMode?: string | null;
    style?: string | null;
  },
) {
  const digits = pairDigits(trade.instrument);
  const isBuy = trade.side.toUpperCase() === "BUY";
  const conf =
    trade.confidence != null
      ? `${(trade.confidence * 100).toFixed(0)}%`
      : "—";

  const fields: EmbedField[] = [
    { name: "Pair", value: trade.instrument },
    { name: "Side", value: trade.side.toUpperCase() },
    { name: "Units", value: String(Math.abs(trade.units)) },
    { name: "Entry", value: fmt(trade.entryPrice, digits) },
    { name: "Take profit", value: fmt(trade.takeProfit, digits) },
    { name: "Stop loss", value: fmt(trade.stopLoss, digits) },
    { name: "Timeframe", value: trade.timeframe || "—" },
    { name: "Source", value: trade.source },
    { name: "Confidence", value: conf },
  ];

  if (trade.style) {
    fields.push({
      name: "Style",
      value: trade.style === "swing" ? "Swing trade" : "Day trade",
    });
  }

  if (trade.rr != null) {
    fields.push({ name: "R:R", value: trade.rr.toFixed(2) });
  }
  if (trade.rewardAmount != null) {
    fields.push({ name: "You make", value: fmtMoney(trade.rewardAmount) });
  }
  if (trade.riskAmount != null) {
    fields.push({
      name: "You lose",
      value: fmtMoney(-Math.abs(trade.riskAmount)),
    });
  }
  if (trade.balance != null) {
    fields.push({ name: "Balance (pre)", value: fmtMoney(trade.balance) });
  }
  if (trade.sizingMode) {
    fields.push({ name: "Sizing", value: trade.sizingMode });
  }
  if (trade.oandaTradeId) {
    fields.push({ name: "OANDA trade", value: `\`${trade.oandaTradeId}\`` });
  }
  if (trade.oandaOrderId) {
    fields.push({ name: "OANDA order", value: `\`${trade.oandaOrderId}\`` });
  }

  await sendDiscordEmbed(webhookUrl, {
    title: `Trade opened · ${trade.side.toUpperCase()} ${trade.instrument}`,
    description: trade.rationale || undefined,
    color: isBuy ? COLOR_BUY : COLOR_SELL,
    fields,
    footer: "Kostin Trades",
  });
}

export async function notifyTradeClosed(
  webhookUrl: string | null | undefined,
  trade: {
    source: string;
    instrument: string;
    side: string | null;
    units: number | null;
    entryPrice: number | null;
    takeProfit: number | null;
    stopLoss: number | null;
    timeframe?: string | null;
    realizedPl: number;
    outcome: string;
    openTime?: Date | string | null;
    closeTime?: Date | string | null;
    closePrice?: number | null;
    oandaTradeId?: string | null;
    rationale?: string | null;
    lesson?: string | null;
    confidence?: number | null;
    style?: string | null;
  },
) {
  const digits = pairDigits(trade.instrument);
  const pl = trade.realizedPl;
  const color =
    pl > 0.01 ? COLOR_WIN : pl < -0.01 ? COLOR_LOSS : COLOR_FLAT;
  const resultEmoji = pl > 0.01 ? "WIN" : pl < -0.01 ? "LOSS" : "FLAT";

  const openTs = trade.openTime
    ? new Date(trade.openTime).toISOString()
    : null;
  const closeTs = trade.closeTime
    ? new Date(trade.closeTime).toISOString()
    : new Date().toISOString();

  let holdLabel = "—";
  if (trade.openTime) {
    const ms =
      new Date(closeTs).getTime() - new Date(trade.openTime).getTime();
    const mins = Math.max(0, Math.round(ms / 60_000));
    if (mins < 60) holdLabel = `${mins}m`;
    else holdLabel = `${(mins / 60).toFixed(1)}h`;
  }

  const fields: EmbedField[] = [
    { name: "Result", value: `**${resultEmoji}** · ${trade.outcome}` },
    { name: "Realized P/L", value: `**${fmtMoney(pl)}**` },
    { name: "Pair", value: trade.instrument },
    { name: "Side", value: (trade.side || "—").toUpperCase() },
    { name: "Units", value: trade.units != null ? String(trade.units) : "—" },
    { name: "Entry", value: fmt(trade.entryPrice, digits) },
    {
      name: "Exit",
      value: trade.closePrice != null ? fmt(trade.closePrice, digits) : "—",
    },
    { name: "Take profit", value: fmt(trade.takeProfit, digits) },
    { name: "Stop loss", value: fmt(trade.stopLoss, digits) },
    { name: "Hold time", value: holdLabel },
    { name: "Timeframe", value: trade.timeframe || "—" },
    { name: "Source", value: trade.source },
  ];

  if (trade.style) {
    fields.push({
      name: "Style",
      value: trade.style === "swing" ? "Swing trade" : "Day trade",
    });
  }
  if (trade.confidence != null) {
    fields.push({
      name: "Confidence",
      value: `${(trade.confidence * 100).toFixed(0)}%`,
    });
  }
  if (trade.oandaTradeId) {
    fields.push({ name: "OANDA trade", value: `\`${trade.oandaTradeId}\`` });
  }
  if (openTs) {
    fields.push({ name: "Opened", value: openTs, inline: false });
  }
  fields.push({ name: "Closed", value: closeTs, inline: false });

  let description = "";
  if (trade.rationale) description += `**Entry thesis**\n${trade.rationale}\n\n`;
  if (trade.lesson) description += `**Lesson**\n${trade.lesson}`;

  await sendDiscordEmbed(webhookUrl, {
    title: `Trade closed · ${resultEmoji} ${trade.instrument} · ${fmtMoney(pl)}`,
    description: description.trim() || undefined,
    color,
    fields,
    footer: "Kostin Trades",
  });
}

export async function notifyHalt(
  webhookUrl: string | null | undefined,
  message: string,
) {
  await sendDiscordEmbed(webhookUrl, {
    title: "Trading halted",
    description: message,
    color: COLOR_HALT,
    fields: [],
    footer: "Kostin Trades · circuit breaker",
  });
}

export async function notifyTradeStatus(
  webhookUrl: string | null | undefined,
  status: {
    instrument: string;
    side: string;
    units: number;
    entryPrice: number;
    currentPrice?: number | null;
    unrealizedPl: number;
    takeProfit?: number | null;
    stopLoss?: number | null;
    openTime?: string | null;
    timeframe?: string | null;
    source?: string | null;
    confidence?: number | null;
    rationale?: string | null;
    oandaTradeId?: string | null;
    balance?: number | null;
    nav?: number | null;
    currency?: string | null;
  },
) {
  const digits = pairDigits(status.instrument);
  const isBuy = status.side.toUpperCase() === "BUY";
  const upl = status.unrealizedPl;
  const color =
    upl > 0.01 ? COLOR_WIN : upl < -0.01 ? COLOR_LOSS : isBuy ? COLOR_BUY : COLOR_SELL;

  let holdLabel = "—";
  if (status.openTime) {
    const mins = Math.max(
      0,
      Math.round((Date.now() - new Date(status.openTime).getTime()) / 60_000),
    );
    holdLabel = mins < 60 ? `${mins}m` : `${(mins / 60).toFixed(1)}h`;
  }

  const fields: EmbedField[] = [
    { name: "Status", value: "**OPEN**" },
    { name: "Unrealized P/L", value: `**${fmtMoney(upl)}**` },
    { name: "Pair", value: status.instrument },
    { name: "Side", value: status.side.toUpperCase() },
    { name: "Units", value: String(Math.abs(status.units)) },
    { name: "Entry", value: fmt(status.entryPrice, digits) },
  ];

  if (status.currentPrice != null) {
    fields.push({ name: "Mark", value: fmt(status.currentPrice, digits) });
  }
  fields.push(
    { name: "Take profit", value: fmt(status.takeProfit ?? null, digits) },
    { name: "Stop loss", value: fmt(status.stopLoss ?? null, digits) },
    { name: "Hold time", value: holdLabel },
  );
  if (status.timeframe) {
    fields.push({ name: "Timeframe", value: status.timeframe });
  }
  if (status.source) {
    fields.push({ name: "Source", value: status.source });
  }
  if (status.confidence != null) {
    fields.push({
      name: "Confidence",
      value: `${(status.confidence * 100).toFixed(0)}%`,
    });
  }
  if (status.balance != null) {
    fields.push({
      name: "Balance",
      value: `${fmtMoney(status.balance)}${status.currency ? ` ${status.currency}` : ""}`,
    });
  }
  if (status.nav != null) {
    fields.push({
      name: "NAV",
      value: `${fmtMoney(status.nav)}${status.currency ? ` ${status.currency}` : ""}`,
    });
  }
  if (status.oandaTradeId) {
    fields.push({ name: "OANDA trade", value: `\`${status.oandaTradeId}\`` });
  }
  if (status.openTime) {
    fields.push({
      name: "Opened",
      value: new Date(status.openTime).toISOString(),
      inline: false,
    });
  }

  await sendDiscordEmbed(webhookUrl, {
    title: `Live trade status · ${status.side.toUpperCase()} ${status.instrument} · ${fmtMoney(upl)}`,
    description: status.rationale
      ? `**Entry thesis**\n${status.rationale}`
      : undefined,
    color,
    fields,
    footer: "Kostin Trades · live status",
  });
}

