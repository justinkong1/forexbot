import { prisma } from "./db";
import { loadCredentials } from "./credentials";
import { assertTradingAllowed } from "./limits";
import { analyzePair, type TradeSignal } from "./ai";
import {
  calculateFullBalanceUnits,
  calculateUnits,
  plannedRiskAmount,
  plannedRewardAmount,
  riskRewardRatio,
  validateTpSl,
  type SizingMode,
} from "./risk";
import { notifyTradeOpened } from "./discord";
import {
  parseEnabledStrategies,
  scanStrategies,
  type StrategySignal,
  type TradeStyle,
} from "./strategies";
import { checkHtfTrend, runEntryFilters } from "./filters";
import {
  getAccountSummary,
  getCandles,
  getInstrumentDetails,
  getOpenTrades,
  getPositionForInstrument,
  placeMarketOrder,
  type CandleGranularity,
  type OandaCredentials,
} from "./oanda";

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
  strategyId?: string;
  /** Day trade (intraday) or swing trade (held days–weeks) */
  style?: TradeStyle;
  /** Skip session/correlation/volatility filters (manual override) */
  skipFilters?: boolean;
}

export interface LaneConfig {
  style: TradeStyle;
  enabled: boolean;
  watchlist: string[];
  timeframe: CandleGranularity;
  intervalMinutes: number;
  strategiesCsv: string;
  maxOpenTrades: number;
  candleCount: number;
}

type LaneSettings = {
  dayEnabled: boolean;
  dayWatchlist: string;
  dayTimeframe: string;
  dayIntervalMinutes: number;
  dayStrategies: string;
  dayMaxOpenTrades: number;
  swingEnabled: boolean;
  swingWatchlist: string;
  swingTimeframe: string;
  swingIntervalMinutes: number;
  swingStrategies: string;
  swingMaxOpenTrades: number;
};

/** Effective total-open-trades ceiling: never below what enabled lanes need */
export function effectiveMaxOpenTrades(settings: {
  maxOpenTrades: number;
  dayEnabled: boolean;
  dayMaxOpenTrades: number;
  swingEnabled: boolean;
  swingMaxOpenTrades: number;
}): number {
  const laneSum =
    (settings.dayEnabled ? settings.dayMaxOpenTrades : 0) +
    (settings.swingEnabled ? settings.swingMaxOpenTrades : 0);
  return Math.max(settings.maxOpenTrades, laneSum);
}

export function laneConfig(
  settings: LaneSettings,
  style: TradeStyle,
): LaneConfig {
  const parseList = (csv: string) =>
    csv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  if (style === "swing") {
    return {
      style,
      enabled: settings.swingEnabled,
      watchlist: parseList(settings.swingWatchlist),
      timeframe: (settings.swingTimeframe || "H4") as CandleGranularity,
      intervalMinutes: settings.swingIntervalMinutes,
      strategiesCsv: settings.swingStrategies,
      maxOpenTrades: settings.swingMaxOpenTrades,
      candleCount: 250,
    };
  }
  return {
    style: "day",
    enabled: settings.dayEnabled,
    watchlist: parseList(settings.dayWatchlist),
    timeframe: (settings.dayTimeframe || "M15") as CandleGranularity,
    intervalMinutes: settings.dayIntervalMinutes,
    strategiesCsv: settings.dayStrategies,
    maxOpenTrades: settings.dayMaxOpenTrades,
    candleCount: 120,
  };
}

async function resolveUnits(params: {
  oanda: OandaCredentials;
  settings: {
    sizingMode: string;
    riskPercent: number;
    maxUnits: number;
    balanceUtilization: number;
  };
  side: "BUY" | "SELL";
  entry: number;
  stopLoss: number;
  account: Record<string, unknown>;
  instrument: string;
}): Promise<{ units: number; riskAmount: number; mode: SizingMode }> {
  const mode = (params.settings.sizingMode === "risk_sl"
    ? "risk_sl"
    : "full_balance") as SizingMode;
  const balance = parseFloat(
    String(params.account.balance ?? params.account.NAV ?? 0),
  );
  const marginAvailable = parseFloat(
    String(params.account.marginAvailable ?? params.account.NAV ?? balance),
  );
  const currency = String(params.account.currency || "USD");

  let units: number;
  if (mode === "full_balance") {
    const details = await getInstrumentDetails(params.oanda, params.instrument);
    if (!details) throw new Error("Could not load instrument margin details");
    const marginRate = parseFloat(details.marginRate);
    const maxOrder = Number(details.maximumOrderUnits || 0);
    units = calculateFullBalanceUnits({
      marginAvailable,
      marginRate,
      entryPrice: params.entry,
      accountCurrency: currency,
      instrument: params.instrument,
      utilizationPercent: params.settings.balanceUtilization ?? 100,
      side: params.side,
      tradeableUnits: maxOrder > 0 ? maxOrder : null,
    });
  } else {
    units = calculateUnits({
      equity: balance,
      riskPercent: params.settings.riskPercent,
      entryPrice: params.entry,
      stopLoss: params.stopLoss,
      maxUnits: params.settings.maxUnits,
      side: params.side,
    });
  }

  const riskAmount = plannedRiskAmount(
    Math.abs(units),
    params.entry,
    params.stopLoss,
  );
  return { units, riskAmount, mode };
}

function sizeFromSignalSync(params: {
  suggestedUnits: number;
  entry: number;
  signal: {
    bias: "BUY" | "SELL" | "WAIT";
    takeProfit: number | null;
    stopLoss: number | null;
  };
}) {
  let riskAmount: number | null = null;
  let rr: number | null = null;
  const { signal, entry, suggestedUnits } = params;
  if (
    signal.bias !== "WAIT" &&
    signal.takeProfit != null &&
    signal.stopLoss != null &&
    entry > 0 &&
    suggestedUnits !== 0
  ) {
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
  style?: TradeStyle;
}) {
  const { oanda, geminiKey, settings } = await loadCredentials();
  if (!oanda) throw new Error("OANDA credentials not configured");
  if (!geminiKey) throw new Error("Gemini API key not configured");

  const style: TradeStyle = params.style ?? "day";
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
    style,
    minRr: settings.minRiskReward,
  });

  const lastClose = candles[candles.length - 1]?.close ?? 0;
  const entry = signal.entryHint || lastClose;
  let suggestedUnits: number | null = null;
  let riskAmount: number | null = null;
  let rr: number | null = null;
  let sizingMode: SizingMode = "full_balance";

  if (
    signal.bias !== "WAIT" &&
    signal.takeProfit != null &&
    signal.stopLoss != null
  ) {
    const sized = await resolveUnits({
      oanda,
      settings,
      side: signal.bias,
      entry,
      stopLoss: signal.stopLoss,
      account,
      instrument: params.instrument,
    });
    suggestedUnits = sized.units;
    riskAmount = sized.riskAmount;
    sizingMode = sized.mode;
    rr = riskRewardRatio(
      entry,
      signal.takeProfit,
      signal.stopLoss,
      signal.bias,
    );
  }

  return {
    signal,
    entry,
    suggestedUnits,
    riskAmount,
    rr,
    lastClose,
    balance,
    candles,
    sizingMode,
  };
}

const HIGHER_TF_MAP: Record<string, CandleGranularity> = {
  M5: "M15",
  M15: "H1",
  M30: "H4",
  H1: "H4",
  H4: "D",
  D: "D",
};

export async function analyzeStrategies(params: {
  instrument: string;
  timeframe: CandleGranularity;
  excludeStrategyIds?: string[];
  style?: TradeStyle;
}) {
  const { oanda, settings } = await loadCredentials();
  if (!oanda) throw new Error("OANDA credentials not configured");

  const style: TradeStyle = params.style ?? "day";
  const lane = laneConfig(settings, style);

  const candles = await getCandles(
    oanda,
    params.instrument,
    params.timeframe,
    lane.candleCount,
  );
  const account = await getAccountSummary(oanda);
  const balance = parseFloat(String(account.balance ?? account.NAV ?? 0));
  let enabled = parseEnabledStrategies(lane.strategiesCsv, style);
  if (params.excludeStrategyIds?.length) {
    enabled = enabled.filter(
      (id) => !params.excludeStrategyIds!.includes(id),
    );
  }
  const scan = scanStrategies({
    instrument: params.instrument,
    candles,
    enabledIds: enabled,
    minVotes: settings.strategyMinVotes,
    style,
    minRr: settings.minRiskReward,
  });

  // Higher-timeframe trend veto (Settings toggle)
  let htfVeto: string | null = null;
  if (
    settings.htfTrendFilterEnabled &&
    scan.consensus &&
    scan.consensus.bias !== "WAIT"
  ) {
    const higherTf = HIGHER_TF_MAP[params.timeframe] || "H4";
    if (higherTf !== params.timeframe) {
      const htfCandles = await getCandles(
        oanda,
        params.instrument,
        higherTf,
        60,
      );
      const trendCheck = checkHtfTrend({
        side: scan.consensus.bias,
        htfCandles,
        htfLabel: higherTf,
      });
      if (!trendCheck.ok) {
        htfVeto = trendCheck.reason;
        scan.consensus = null;
      }
    }
  }

  let suggestedUnits: number | null = null;
  let riskAmount: number | null = null;
  let rr: number | null = null;
  let sizingMode: SizingMode = "full_balance";
  if (scan.consensus && scan.consensus.bias !== "WAIT") {
    const sized = await resolveUnits({
      oanda,
      settings,
      side: scan.consensus.bias,
      entry: scan.consensus.entry,
      stopLoss: scan.consensus.stopLoss!,
      account,
      instrument: params.instrument,
    });
    const packed = sizeFromSignalSync({
      suggestedUnits: sized.units,
      entry: scan.consensus.entry,
      signal: scan.consensus,
    });
    suggestedUnits = packed.suggestedUnits;
    riskAmount = packed.riskAmount;
    rr = packed.rr;
    sizingMode = sized.mode;
  }

  return {
    ...scan,
    suggestedUnits,
    riskAmount,
    rr,
    balance,
    lastClose: scan.entry,
    enabledStrategies: enabled,
    sizingMode,
    htfVeto,
    candles,
    style,
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

  const maxOpen = effectiveMaxOpenTrades(settings);
  const openTrades = await getOpenTrades(oanda);
  if (openTrades.length >= maxOpen) {
    throw new Error(
      `Max open trades reached (${maxOpen})`,
    );
  }

  if (!input.skipFilters) {
    const filterCandles = await getCandles(
      oanda,
      input.instrument,
      (input.timeframe as CandleGranularity) || "H1",
      60,
    );
    const filterResult = runEntryFilters({
      instrument: input.instrument,
      candles: filterCandles,
      openInstruments: openTrades.map((t) => t.instrument),
      // Swing entries aren't time-of-day sensitive — session filter is day-only
      sessionFilterEnabled:
        settings.sessionFilterEnabled && input.style !== "swing",
    });
    if (!filterResult.ok) {
      throw new Error(filterResult.reason || "Blocked by entry filter");
    }
  }

  const account = await getAccountSummary(oanda);
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
    const sized = await resolveUnits({
      oanda,
      settings,
      side: input.side,
      entry,
      stopLoss: input.stopLoss,
      account,
      instrument: input.instrument,
    });
    units = sized.units;
  } else {
    units =
      input.side === "SELL" ? -Math.abs(units) : Math.abs(units);
    if (
      settings.sizingMode === "risk_sl" &&
      Math.abs(units) > settings.maxUnits
    ) {
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
        strategyId: input.strategyId ?? null,
        style: input.style ?? null,
      },
    });

    const balance = parseFloat(String(account.balance ?? account.NAV ?? 0));
    const riskAmt = plannedRiskAmount(
      Math.abs(units),
      fillPrice,
      input.stopLoss,
    );
    const rewardAmt = plannedRewardAmount(
      Math.abs(units),
      fillPrice,
      input.takeProfit,
    );
    const rr = riskRewardRatio(
      fillPrice,
      input.takeProfit,
      input.stopLoss,
      input.side,
    );

    await notifyTradeOpened(discordWebhook, {
      source: input.source,
      instrument: input.instrument,
      side: input.side,
      units: Math.abs(units),
      entryPrice: fillPrice,
      takeProfit: input.takeProfit,
      stopLoss: input.stopLoss,
      timeframe: input.timeframe,
      confidence: input.confidence,
      rationale: input.rationale,
      oandaTradeId: tradeId || null,
      oandaOrderId: fill?.id || result.orderCreateTransaction?.id || null,
      riskAmount: riskAmt,
      rewardAmount: rewardAmt,
      rr,
      balance,
      sizingMode: settings.sizingMode,
      style: input.style ?? null,
    });

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
        strategyId: input.strategyId ?? null,
        style: input.style ?? null,
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
  strategyId?: string | null;
  style?: TradeStyle | null;
}) {
  const bias = params.signal?.bias;
  const signalStrategyId =
    params.signal && "id" in params.signal ? params.signal.id : null;
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
      strategyId: params.strategyId ?? signalStrategyId,
      style: params.style ?? null,
    },
  });
}
