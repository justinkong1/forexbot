import { NextResponse } from "next/server";
import { getOrCreateSettings } from "@/lib/db";
import { decrypt, encrypt, maskSecret } from "@/lib/crypto";
import { getAccountSummary, type OandaEnv } from "@/lib/oanda";
import { ensureAutoTradeWorker } from "@/lib/auto-trade";
import { presetValues, type RiskProfile } from "@/lib/presets";
import { apiError } from "@/lib/api-error";

export async function GET() {
  try {
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
      riskProfile: s.riskProfile || "safe",
      maxDrawdownPercent: s.maxDrawdownPercent,
      lossStreakHalt: s.lossStreakHalt,
      haltCooldownMinutes: s.haltCooldownMinutes,
      sessionFilterEnabled: s.sessionFilterEnabled,
      htfTrendFilterEnabled: s.htfTrendFilterEnabled,
      autoDisableStrategies: s.autoDisableStrategies,
      peakEquity: s.peakEquity,
      haltedUntil: s.haltedUntil,
      fullBalanceLiveAcknowledged: s.fullBalanceLiveAcknowledged,
      dayEnabled: s.dayEnabled,
      dayWatchlist: s.dayWatchlist,
      dayTimeframe: s.dayTimeframe,
      dayIntervalMinutes: s.dayIntervalMinutes,
      dayStrategies: s.dayStrategies,
      dayAtrSlMult: s.dayAtrSlMult,
      dayAtrTpMult: s.dayAtrTpMult,
      dayMaxOpenTrades: s.dayMaxOpenTrades,
      swingEnabled: s.swingEnabled,
      swingWatchlist: s.swingWatchlist,
      swingTimeframe: s.swingTimeframe,
      swingIntervalMinutes: s.swingIntervalMinutes,
      swingStrategies: s.swingStrategies,
      swingAtrSlMult: s.swingAtrSlMult,
      swingAtrTpMult: s.swingAtrTpMult,
      swingMaxOpenTrades: s.swingMaxOpenTrades,
    });
  } catch (e) {
    return apiError(e, "Failed to load settings");
  }
}

export async function PUT(req: Request) {
  try {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const s = await getOrCreateSettings();

  const oandaEnv = (body.oandaEnv as OandaEnv) || s.oandaEnv || "practice";
  if (oandaEnv === "live" && !body.liveAcknowledged && !s.liveAcknowledged) {
    return NextResponse.json(
      { error: "Acknowledge live trading risk before switching to Live" },
      { status: 400 },
    );
  }

  const riskProfile: RiskProfile = ["safe", "balanced", "custom"].includes(
    String(body.riskProfile),
  )
    ? (String(body.riskProfile) as RiskProfile)
    : ((s.riskProfile as RiskProfile) || "safe");

  const data: Record<string, unknown> = {
    riskProfile,
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
      body.sizingMode === "full_balance"
        ? "full_balance"
        : body.sizingMode === "risk_sl"
          ? "risk_sl"
          : s.sizingMode || "risk_sl",
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
    maxDrawdownPercent:
      body.maxDrawdownPercent === "" || body.maxDrawdownPercent == null
        ? s.maxDrawdownPercent
        : Math.min(90, Math.max(1, Number(body.maxDrawdownPercent))),
    lossStreakHalt:
      body.lossStreakHalt === "" || body.lossStreakHalt == null
        ? s.lossStreakHalt
        : Math.max(2, Math.min(20, Number(body.lossStreakHalt))),
    haltCooldownMinutes: Math.max(
      0,
      Number(body.haltCooldownMinutes ?? s.haltCooldownMinutes ?? 60),
    ),
    sessionFilterEnabled:
      body.sessionFilterEnabled != null
        ? !!body.sessionFilterEnabled
        : s.sessionFilterEnabled,
    htfTrendFilterEnabled:
      body.htfTrendFilterEnabled != null
        ? !!body.htfTrendFilterEnabled
        : s.htfTrendFilterEnabled,
    autoDisableStrategies:
      body.autoDisableStrategies != null
        ? !!body.autoDisableStrategies
        : s.autoDisableStrategies,
    fullBalanceLiveAcknowledged:
      !!body.fullBalanceLiveAcknowledged || s.fullBalanceLiveAcknowledged,
    dayEnabled: body.dayEnabled != null ? !!body.dayEnabled : s.dayEnabled,
    dayWatchlist: String(body.dayWatchlist ?? s.dayWatchlist),
    dayTimeframe: ["M5", "M15", "M30", "H1"].includes(String(body.dayTimeframe))
      ? String(body.dayTimeframe)
      : s.dayTimeframe,
    dayIntervalMinutes: Math.max(
      5,
      Number(body.dayIntervalMinutes ?? s.dayIntervalMinutes),
    ),
    dayStrategies: String(body.dayStrategies ?? s.dayStrategies),
    dayAtrSlMult: Math.min(
      10,
      Math.max(0.5, Number(body.dayAtrSlMult ?? s.dayAtrSlMult)),
    ),
    dayAtrTpMult: Math.min(
      20,
      Math.max(0.5, Number(body.dayAtrTpMult ?? s.dayAtrTpMult)),
    ),
    dayMaxOpenTrades: Math.min(
      10,
      Math.max(1, Number(body.dayMaxOpenTrades ?? s.dayMaxOpenTrades)),
    ),
    swingEnabled:
      body.swingEnabled != null ? !!body.swingEnabled : s.swingEnabled,
    swingWatchlist: String(body.swingWatchlist ?? s.swingWatchlist),
    swingTimeframe: ["H1", "H4", "D"].includes(String(body.swingTimeframe))
      ? String(body.swingTimeframe)
      : s.swingTimeframe,
    swingIntervalMinutes: Math.max(
      30,
      Number(body.swingIntervalMinutes ?? s.swingIntervalMinutes),
    ),
    swingStrategies: String(body.swingStrategies ?? s.swingStrategies),
    swingAtrSlMult: Math.min(
      10,
      Math.max(0.5, Number(body.swingAtrSlMult ?? s.swingAtrSlMult)),
    ),
    swingAtrTpMult: Math.min(
      20,
      Math.max(0.5, Number(body.swingAtrTpMult ?? s.swingAtrTpMult)),
    ),
    swingMaxOpenTrades: Math.min(
      10,
      Math.max(1, Number(body.swingMaxOpenTrades ?? s.swingMaxOpenTrades)),
    ),
  };

  // Preset overrides: writing a preset pins its guardrail values
  const preset = presetValues(riskProfile);
  if (preset) {
    Object.assign(data, preset);
  }

  // Reset peak equity if requested (drawdown protection restart)
  if (body.resetPeakEquity) {
    data.peakEquity = null;
    data.haltedUntil = null;
  }

  // Full-balance sizing on Live requires explicit acknowledgment
  if (
    data.sizingMode === "full_balance" &&
    oandaEnv === "live" &&
    !data.fullBalanceLiveAcknowledged
  ) {
    return NextResponse.json(
      {
        error:
          "Full-balance sizing on a Live account can wipe out your money on one trade. Tick the acknowledgment box to enable it, or use risk-based sizing.",
      },
      { status: 400 },
    );
  }

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
  } catch (e) {
    return apiError(e, "Failed to save settings");
  }
}
