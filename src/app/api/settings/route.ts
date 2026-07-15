import { NextResponse } from "next/server";
import { getOrCreateSettings } from "@/lib/db";
import { decrypt, encrypt, maskSecret } from "@/lib/crypto";
import { getAccountSummary, type OandaEnv } from "@/lib/oanda";
import { ensureAutoTradeWorker } from "@/lib/auto-trade";

export async function GET() {
  ensureAutoTradeWorker();
  const s = await getOrCreateSettings();
  let oandaTokenMasked = "";
  let geminiMasked = "";
  let discordMasked = "";
  try {
    if (s.oandaTokenEnc) oandaTokenMasked = maskSecret(decrypt(s.oandaTokenEnc));
  } catch {
    oandaTokenMasked = "(encrypted)";
  }
  try {
    if (s.geminiKeyEnc) geminiMasked = maskSecret(decrypt(s.geminiKeyEnc));
  } catch {
    geminiMasked = "(encrypted)";
  }
  try {
    if (s.discordWebhookEnc)
      discordMasked = maskSecret(decrypt(s.discordWebhookEnc));
  } catch {
    discordMasked = "(encrypted)";
  }

  return NextResponse.json({
    oandaAccountId: s.oandaAccountId || "",
    oandaEnv: s.oandaEnv,
    oandaTokenMasked,
    geminiMasked,
    discordMasked,
    hasOandaToken: !!s.oandaTokenEnc,
    hasGeminiKey: !!s.geminiKeyEnc,
    geminiModel: s.geminiModel || "gemini-2.5-flash",
    hasDiscord: !!s.discordWebhookEnc,
    riskPercent: s.riskPercent,
    maxUnits: s.maxUnits,
    minRiskReward: s.minRiskReward,
    sizingMode: s.sizingMode || "full_balance",
    balanceUtilization: s.balanceUtilization ?? 100,
    autoTradeEnabled: s.autoTradeEnabled,
    autoWatchlist: s.autoWatchlist,
    autoTimeframe: s.autoTimeframe,
    autoIntervalMinutes: s.autoIntervalMinutes,
    autoMinConfidence: s.autoMinConfidence,
    maxOpenTrades: s.maxOpenTrades,
    autoMode: s.autoMode || "strategy",
    enabledStrategies: s.enabledStrategies,
    strategyMinVotes: s.strategyMinVotes,
    atrSlMult: s.atrSlMult,
    atrTpMult: s.atrTpMult,
    liveAcknowledged: s.liveAcknowledged,
    liveAutoAcknowledged: s.liveAutoAcknowledged,
    dailyMaxLoss: s.dailyMaxLoss,
    dailyMaxWin: s.dailyMaxWin,
    weeklyMaxLoss: s.weeklyMaxLoss,
    weeklyMaxWin: s.weeklyMaxWin,
  });
}

export async function PUT(req: Request) {
  const body = await req.json();
  const s = await getOrCreateSettings();

  const oandaEnv = (body.oandaEnv as OandaEnv) || s.oandaEnv || "practice";
  if (oandaEnv === "live" && !body.liveAcknowledged && !s.liveAcknowledged) {
    return NextResponse.json(
      { error: "Acknowledge live trading risk before switching to Live" },
      { status: 400 },
    );
  }

  const data: Record<string, unknown> = {
    oandaAccountId: body.oandaAccountId ?? s.oandaAccountId,
    oandaEnv,
    geminiModel: String(body.geminiModel || s.geminiModel || "gemini-2.5-flash"),
    riskPercent: Math.min(
      100,
      Math.max(0.1, Number(body.riskPercent ?? s.riskPercent)),
    ),
    maxUnits: Math.max(1, Number(body.maxUnits ?? s.maxUnits)),
    minRiskReward: Math.max(0.5, Number(body.minRiskReward ?? s.minRiskReward)),
    sizingMode:
      body.sizingMode === "risk_sl" ? "risk_sl" : "full_balance",
    balanceUtilization: Math.min(
      100,
      Math.max(1, Number(body.balanceUtilization ?? s.balanceUtilization ?? 100)),
    ),
    autoTradeEnabled: !!body.autoTradeEnabled,
    autoWatchlist: String(body.autoWatchlist ?? s.autoWatchlist),
    autoTimeframe: String(body.autoTimeframe ?? s.autoTimeframe),
    autoIntervalMinutes: Math.max(
      5,
      Number(body.autoIntervalMinutes ?? s.autoIntervalMinutes),
    ),
    autoMinConfidence: Math.min(
      1,
      Math.max(0, Number(body.autoMinConfidence ?? s.autoMinConfidence)),
    ),
    maxOpenTrades: Math.max(1, Number(body.maxOpenTrades ?? s.maxOpenTrades)),
    autoMode: ["strategy", "ai", "both"].includes(String(body.autoMode))
      ? String(body.autoMode)
      : s.autoMode || "strategy",
    enabledStrategies: String(
      body.enabledStrategies ?? s.enabledStrategies,
    ),
    strategyMinVotes: Math.max(
      1,
      Math.min(4, Number(body.strategyMinVotes ?? s.strategyMinVotes ?? 1)),
    ),
    atrSlMult: Math.max(
      0.5,
      Number(body.atrSlMult ?? s.atrSlMult ?? 1.5),
    ),
    atrTpMult: Math.max(
      0.5,
      Number(body.atrTpMult ?? s.atrTpMult ?? 2.5),
    ),
    liveAcknowledged: !!body.liveAcknowledged || s.liveAcknowledged,
    liveAutoAcknowledged:
      !!body.liveAutoAcknowledged || s.liveAutoAcknowledged,
    dailyMaxLoss:
      body.dailyMaxLoss === "" || body.dailyMaxLoss == null
        ? null
        : Number(body.dailyMaxLoss),
    dailyMaxWin:
      body.dailyMaxWin === "" || body.dailyMaxWin == null
        ? null
        : Number(body.dailyMaxWin),
    weeklyMaxLoss:
      body.weeklyMaxLoss === "" || body.weeklyMaxLoss == null
        ? null
        : Number(body.weeklyMaxLoss),
    weeklyMaxWin:
      body.weeklyMaxWin === "" || body.weeklyMaxWin == null
        ? null
        : Number(body.weeklyMaxWin),
  };

  if (body.oandaToken && String(body.oandaToken).trim()) {
    data.oandaTokenEnc = encrypt(String(body.oandaToken).trim());
  }
  if (body.geminiKey && String(body.geminiKey).trim()) {
    data.geminiKeyEnc = encrypt(String(body.geminiKey).trim());
  }
  if (body.clearDiscord) {
    data.discordWebhookEnc = null;
  } else if (body.discordWebhook && String(body.discordWebhook).trim()) {
    data.discordWebhookEnc = encrypt(String(body.discordWebhook).trim());
  }

  if (
    data.autoTradeEnabled &&
    oandaEnv === "live" &&
    !data.liveAutoAcknowledged
  ) {
    return NextResponse.json(
      {
        error:
          "Acknowledge live auto-trade risk before enabling auto-trade on Live",
      },
      { status: 400 },
    );
  }

  // Validate OANDA if we have token+account
  const tokenEnc = (data.oandaTokenEnc as string) || s.oandaTokenEnc;
  const accountId = data.oandaAccountId as string;
  let accountPreview = null;
  if (tokenEnc && accountId) {
    try {
      const { decrypt: dec } = await import("@/lib/crypto");
      accountPreview = await getAccountSummary({
        token: dec(tokenEnc),
        accountId,
        env: oandaEnv,
      });
    } catch (e) {
      return NextResponse.json(
        {
          error: `OANDA validation failed: ${e instanceof Error ? e.message : e}`,
        },
        { status: 400 },
      );
    }
  }

  const { prisma } = await import("@/lib/db");
  const updated = await prisma.settings.update({
    where: { id: "default" },
    data,
  });

  ensureAutoTradeWorker();

  return NextResponse.json({
    ok: true,
    account: accountPreview
      ? {
          balance: accountPreview.balance,
          NAV: accountPreview.NAV,
          currency: accountPreview.currency,
          openTradeCount: accountPreview.openTradeCount,
        }
      : null,
    autoTradeEnabled: updated.autoTradeEnabled,
  });
}
