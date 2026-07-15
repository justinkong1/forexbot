/**
 * Position sizing from risk % of equity and SL distance.
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
  const riskAmount = equity * (Math.min(riskPercent, 5) / 100);
  const slDistance = Math.abs(entryPrice - stopLoss);
  if (slDistance <= 0 || entryPrice <= 0) return 0;
  // Approximate: risk / (distance as fraction of price * notional-per-unit ~= price)
  // For forex, 1 unit ≈ 1 base currency; P/L ≈ units * price change
  let units = Math.floor(riskAmount / slDistance);
  if (units < 1) units = 1;
  units = Math.min(units, maxUnits);
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
