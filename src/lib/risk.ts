/**
 * Position sizing helpers for OANDA FX.
 */

export type SizingMode = "risk_sl" | "full_balance";

/**
 * Size so that dollar risk at the stop ≈ riskPercent of equity.
 */
export function calculateUnits(params: {
  equity: number;
  riskPercent: number;
  entryPrice: number;
  stopLoss: number;
  maxUnits: number;
  side: "BUY" | "SELL";
}): number {
  const { equity, riskPercent, entryPrice, stopLoss, maxUnits, side } = params;
  const riskAmount = equity * (Math.max(0.1, Math.min(riskPercent, 100)) / 100);
  const slDistance = Math.abs(entryPrice - stopLoss);
  if (slDistance <= 0 || entryPrice <= 0) return 0;
  let units = Math.floor(riskAmount / slDistance);
  if (units < 1) units = 1;
  units = Math.min(units, maxUnits);
  return side === "SELL" ? -units : units;
}

/**
 * Size to use ~utilization% of available margin (i.e. nearly full account for 1 trade).
 *
 * OANDA approx:
 * - If instrument base == account currency (e.g. USD_JPY on USD): margin ≈ units × marginRate
 * - Else (e.g. EUR_USD on USD): margin ≈ units × price × marginRate
 */
export function calculateFullBalanceUnits(params: {
  marginAvailable: number;
  marginRate: number;
  entryPrice: number;
  accountCurrency: string;
  instrument: string;
  utilizationPercent: number;
  side: "BUY" | "SELL";
  tradeableUnits?: number | null;
}): number {
  const {
    marginAvailable,
    marginRate,
    entryPrice,
    accountCurrency,
    instrument,
    utilizationPercent,
    side,
    tradeableUnits,
  } = params;

  if (marginAvailable <= 0 || marginRate <= 0 || entryPrice <= 0) return 0;

  const util = Math.max(1, Math.min(100, utilizationPercent)) / 100;
  const budget = marginAvailable * util;
  const [base] = instrument.split("_");
  const baseIsAccount = base?.toUpperCase() === accountCurrency.toUpperCase();

  // Margin ≈ units * (priceFactor) * marginRate
  const priceFactor = baseIsAccount ? 1 : entryPrice;
  let units = Math.floor(budget / (priceFactor * marginRate));

  // Stay slightly under 100% so the order isn't rejected for insufficient margin
  if (utilizationPercent >= 99) {
    units = Math.floor(units * 0.99);
  }

  if (tradeableUnits != null && tradeableUnits > 0) {
    // OANDA often increments by 1; respect maximum order size if provided
    units = Math.min(units, Math.floor(tradeableUnits));
  }

  if (units < 1) units = 1;
  return side === "SELL" ? -units : units;
}

export function riskRewardRatio(
  entry: number,
  takeProfit: number,
  stopLoss: number,
  side: "BUY" | "SELL",
): number {
  const reward =
    side === "BUY" ? takeProfit - entry : entry - takeProfit;
  const risk = side === "BUY" ? entry - stopLoss : stopLoss - entry;
  if (risk <= 0) return 0;
  return reward / risk;
}

export function validateTpSl(params: {
  side: "BUY" | "SELL";
  entry: number;
  takeProfit: number;
  stopLoss: number;
  minRr: number;
}): { ok: true } | { ok: false; error: string } {
  const { side, entry, takeProfit, stopLoss, minRr } = params;
  if (side === "BUY") {
    if (!(takeProfit > entry && stopLoss < entry)) {
      return { ok: false, error: "BUY requires TP above entry and SL below entry" };
    }
  } else {
    if (!(takeProfit < entry && stopLoss > entry)) {
      return { ok: false, error: "SELL requires TP below entry and SL above entry" };
    }
  }
  const rr = riskRewardRatio(entry, takeProfit, stopLoss, side);
  if (rr < minRr) {
    return {
      ok: false,
      error: `Risk/reward ${rr.toFixed(2)} is below minimum ${minRr}`,
    };
  }
  return { ok: true };
}

export function plannedRiskAmount(
  units: number,
  entry: number,
  stopLoss: number,
): number {
  return Math.abs(units) * Math.abs(entry - stopLoss);
}
