import { prisma } from "./db";
import { loadCredentials } from "./credentials";
import { assertTradingAllowed } from "./limits";
import {
  getAccountSummary,
  getCandles,
  getOpenTrades,
  getPositionForInstrument,
  placeMarketOrder,
  type CandleGranularity,
} from "./oanda";
import { analyzePair, type TradeSignal } from "./ai";
import {
  calculateUnits,
  plannedRiskAmount,
  riskRewardRatio,
  validateTpSl,
} from "./risk";
import { sendDiscord } from "./discord";
import {
  parseEnabledStrategies,
  scanStrategies,
  type StrategySignal,
} from "./strategies";

export type TradeSource = "manual" | "auto" | "strategy";

export interface ExecuteTradeInput {
  source: TradeSource;
  instrument: string;
  timeframe: string;
  side: "BUY" | "SELL";
  units?: number;
  takeProfit: number;
  stopLoss: number;
  confidence?: number;
  rationale?: string;
  entryPrice?: number;
}

function sizeFromSignal(params: {
  balance: number;
  riskPercent: number;
  maxUnits: number;
  entry: number;
  signal: { bias: "BUY" | "SELL" | "WAIT"; takeProfit: number | null; stopLoss: number | null };
}) {
  let suggestedUnits: number | null = null;
  let riskAmount: number | null = null;
  let rr: number | null = null;
  const { signal, entry, balance } = params;
  if (
    signal.bias !== "WAIT" &&
    signal.takeProfit != null &&
    signal.stopLoss != null &&
    entry > 0
  ) {
    suggestedUnits = calculateUnits({
      equity: balance,
      riskPercent: params.riskPercent,
      entryPrice: entry,
      stopLoss: signal.stopLoss,
      maxUnits: params.maxUnits,
      side: signal.bias,
    });
    riskAmount = plannedRiskAmount(
      Math.abs(suggestedUnits),
      entry,
      signal.stopLoss,
    );
    rr = riskRewardRatio(
      entry,
      signal.takeProfit,
      signal.stopLoss,
      signal.bias,
    );
  }
  return { suggestedUnits, riskAmount, rr };
}

export async function analyzeInstrument(params: {
  instrument: string;
  timeframe: CandleGranularity;
}) {
  const { oanda, geminiKey, settings } = await loadCredentials();
  if (!oanda) throw new Error("OANDA credentials not configured");
  if (!geminiKey) throw new Error("Gemini API key not configured");

  const candles = await getCandles(oanda, params.instrument, params.timeframe, 100);
  const higherMap: Record<string, CandleGranularity> = {
    M5: "M15",
    M15: "H1",
    H1: "H4",
    H4: "D",
    D: "D",
  };
  const higherTf = higherMap[params.timeframe] || "H4";
  const higherTfCandles =
    higherTf === params.timeframe
      ? undefined
      : await getCandles(oanda, params.instrument, higherTf, 60);

  const account = await getAccountSummary(oanda);
  const balance = parseFloat(String(account.balance ?? account.NAV ?? 0));

  const signal = await analyzePair({
    apiKey: geminiKey,
    instrument: params.instrument,
    timeframe: params.timeframe,
    candles,
    higherTfCandles,
    accountBalance: balance,
    model: settings.geminiModel,
  });

  const lastClose = candles[candles.length - 1]?.close ?? 0;
  const entry = signal.entryHint || lastClose;
  const sized = sizeFromSignal({
    balance,
    riskPercent: settings.riskPercent,
    maxUnits: settings.maxUnits,
    entry,
    signal,
  });

  return {
    signal,
    entry,
    ...sized,
    lastClose,
    balance,
    candles,
  };
}

export async function analyzeStrategies(params: {
  instrument: string;
  timeframe: CandleGranularity;
}) {
  const { oanda, settings } = await loadCredentials();
  if (!oanda) throw new Error("OANDA credentials not configured");

  const candles = await getCandles(oanda, params.instrument, params.timeframe, 120);
  const account = await getAccountSummary(oanda);
  const balance = parseFloat(String(account.balance ?? account.NAV ?? 0));
  const enabled = parseEnabledStrategies(settings.enabledStrategies);
  const scan = scanStrategies({
    instrument: params.instrument,
    candles,
    enabledIds: enabled,
    minVotes: settings.strategyMinVotes,
    atrSlMult: settings.atrSlMult,
    atrTpMult: settings.atrTpMult,
  });

  let suggestedUnits: number | null = null;
  let riskAmount: number | null = null;
  let rr: number | null = null;
  if (scan.consensus) {
    const sized = sizeFromSignal({
      balance,
      riskPercent: settings.riskPercent,
      maxUnits: settings.maxUnits,
      entry: scan.consensus.entry,
      signal: scan.consensus,
    });
    suggestedUnits = sized.suggestedUnits;
    riskAmount = sized.riskAmount;
    rr = sized.rr;
  }

  return {
    ...scan,
    suggestedUnits,
    riskAmount,
    rr,
    balance,
    lastClose: scan.entry,
    enabledStrategies: enabled,
  };
}

export async function executeTrade(input: ExecuteTradeInput) {
  const { oanda, discordWebhook, settings } = await loadCredentials();
  if (!oanda) throw new Error("OANDA credentials not configured");

  if (oanda.env === "live" && !settings.liveAcknowledged) {
    throw new Error("Live trading not acknowledged in Settings");
  }

  await assertTradingAllowed();

  const existing = await getPositionForInstrument(oanda, input.instrument);
  if (existing) {
    throw new Error(`Open position already exists on ${input.instrument}`);
  }

  const openTrades = await getOpenTrades(oanda);
  if (openTrades.length >= settings.maxOpenTrades) {
    throw new Error(
      `Max open trades reached (${settings.maxOpenTrades})`,
    );
  }

  const account = await getAccountSummary(oanda);
  const balance = parseFloat(String(account.balance ?? account.NAV ?? 0));
  const entry =
    input.entryPrice ??
    (await getCandles(oanda, input.instrument, "M5", 2)).at(-1)?.close;
  if (!entry) throw new Error("Could not determine entry price");

  const check = validateTpSl({
    side: input.side,
    entry,
    takeProfit: input.takeProfit,
    stopLoss: input.stopLoss,
    minRr: settings.minRiskReward,
  });
  if (!check.ok) throw new Error(check.error);

  let units = input.units;
  if (units == null || units === 0) {
    units = calculateUnits({
      equity: balance,
      riskPercent: settings.riskPercent,
      entryPrice: entry,
      stopLoss: input.stopLoss,
      maxUnits: settings.maxUnits,
      side: input.side,
    });
  } else {
    // Normalize sign
    units =
      input.side === "SELL"
        ? -Math.abs(units)
        : Math.abs(units);
    if (Math.abs(units) > settings.maxUnits) {
      throw new Error(`Units exceed maxUnits cap (${settings.maxUnits})`);
    }
  }

  if (units === 0) throw new Error("Calculated units is zero");

  try {
    const result = await placeMarketOrder(oanda, {
      instrument: input.instrument,
      units,
      takeProfit: input.takeProfit,
      stopLoss: input.stopLoss,
    });

    const fill = result.orderFillTransaction;
    const tradeId = fill?.tradeOpened?.tradeID;
    const fillPrice = fill?.tradeOpened?.price
      ? parseFloat(fill.tradeOpened.price)
      : entry;

    const journal = await prisma.tradeJournal.create({
      data: {
        source: input.source,
        outcome: "open",
        instrument: input.instrument,
        side: input.side,
        units: Math.abs(units),
        entryPrice: fillPrice,
        takeProfit: input.takeProfit,
        stopLoss: input.stopLoss,
        confidence: input.confidence ?? null,
        rationale: input.rationale ?? null,
        oandaOrderId: fill?.id || result.orderCreateTransaction?.id || null,
        oandaTradeId: tradeId || null,
        timeframe: input.timeframe,
      },
    });

    await sendDiscord(
      discordWebhook,
      `[${input.source.toUpperCase()}] ${input.side} ${input.instrument} units=${Math.abs(units)} TP=${input.takeProfit} SL=${input.stopLoss}`,
    );

    return { journal, result, fillPrice, units };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.tradeJournal.create({
      data: {
        source: input.source,
        outcome: "error",
        instrument: input.instrument,
        side: input.side,
        units: Math.abs(units),
        takeProfit: input.takeProfit,
        stopLoss: input.stopLoss,
        confidence: input.confidence ?? null,
        rationale: input.rationale ?? null,
        timeframe: input.timeframe,
        skipReason: msg,
      },
    });
    throw e;
  }
}

export async function recordSkip(params: {
  source: TradeSource;
  instrument: string;
  timeframe: string;
  signal?: TradeSignal | StrategySignal | null;
  reason: string;
}) {
  const bias = params.signal?.bias;
  return prisma.tradeJournal.create({
    data: {
      source: params.source,
      outcome: "skipped",
      instrument: params.instrument,
      timeframe: params.timeframe,
      side: bias === "WAIT" || !bias ? null : bias,
      confidence: params.signal?.confidence ?? null,
      rationale: params.signal?.rationale ?? null,
      takeProfit: params.signal?.takeProfit ?? null,
      stopLoss: params.signal?.stopLoss ?? null,
      skipReason: params.reason,
    },
  });
}
