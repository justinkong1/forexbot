export type OandaEnv = "practice" | "live";

export function oandaBaseUrl(env: OandaEnv): string {
  return env === "live"
    ? "https://api-fxtrade.oanda.com"
    : "https://api-fxpractice.oanda.com";
}

export interface OandaCredentials {
  token: string;
  accountId: string;
  env: OandaEnv;
}

async function oandaFetch(
  creds: OandaCredentials,
  path: string,
  init?: RequestInit,
) {
  const url = `${oandaBaseUrl(creds.env)}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${creds.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg =
      typeof body === "object" && body && "errorMessage" in body
        ? String((body as { errorMessage: string }).errorMessage)
        : text || res.statusText;
    throw new Error(`OANDA ${res.status}: ${msg}`);
  }
  return body;
}

export async function getAccountSummary(creds: OandaCredentials) {
  const data = (await oandaFetch(
    creds,
    `/v3/accounts/${creds.accountId}/summary`,
  )) as { account: Record<string, unknown> };
  return data.account;
}

export async function getInstruments(creds: OandaCredentials) {
  const data = (await oandaFetch(
    creds,
    `/v3/accounts/${creds.accountId}/instruments`,
  )) as {
    instruments: Array<{
      name: string;
      displayName: string;
      type: string;
      marginRate: string;
      pipLocation: number;
    }>;
  };
  return data.instruments.filter((i) => i.type === "CURRENCY");
}

export async function getInstrumentDetails(
  creds: OandaCredentials,
  instrument: string,
) {
  const data = (await oandaFetch(
    creds,
    `/v3/accounts/${creds.accountId}/instruments?instruments=${encodeURIComponent(instrument)}`,
  )) as {
    instruments: Array<{
      name: string;
      marginRate: string;
      pipLocation: number;
      minimumTradeSize: string;
      maximumOrderUnits?: string;
    }>;
  };
  return data.instruments[0] ?? null;
}

export type CandleGranularity = "M5" | "M15" | "M30" | "H1" | "H4" | "D";

export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  complete: boolean;
}

export async function getCandles(
  creds: OandaCredentials,
  instrument: string,
  granularity: CandleGranularity,
  count = 100,
): Promise<Candle[]> {
  const data = (await oandaFetch(
    creds,
    `/v3/instruments/${encodeURIComponent(instrument)}/candles?granularity=${granularity}&count=${count}&price=M`,
  )) as {
    candles: Array<{
      time: string;
      volume: number;
      complete: boolean;
      mid: { o: string; h: string; l: string; c: string };
    }>;
  };
  return data.candles.map((c) => ({
    time: c.time,
    open: parseFloat(c.mid.o),
    high: parseFloat(c.mid.h),
    low: parseFloat(c.mid.l),
    close: parseFloat(c.mid.c),
    volume: c.volume,
    complete: c.complete,
  }));
}

export async function getOpenPositions(creds: OandaCredentials) {
  const data = (await oandaFetch(
    creds,
    `/v3/accounts/${creds.accountId}/openPositions`,
  )) as {
    positions: Array<{
      instrument: string;
      long: { units: string; averagePrice?: string; unrealizedPL?: string };
      short: { units: string; averagePrice?: string; unrealizedPL?: string };
    }>;
  };
  return data.positions;
}

export async function getOpenTrades(creds: OandaCredentials) {
  const data = (await oandaFetch(
    creds,
    `/v3/accounts/${creds.accountId}/openTrades`,
  )) as {
    trades: Array<{
      id: string;
      instrument: string;
      price: string;
      currentUnits: string;
      unrealizedPL: string;
      openTime: string;
      takeProfitOrder?: { price: string };
      stopLossOrder?: { price: string };
    }>;
  };
  return data.trades;
}

export async function getPositionForInstrument(
  creds: OandaCredentials,
  instrument: string,
) {
  try {
    const data = (await oandaFetch(
      creds,
      `/v3/accounts/${creds.accountId}/positions/${encodeURIComponent(instrument)}`,
    )) as {
      position: {
        instrument: string;
        long: { units: string };
        short: { units: string };
      };
    };
    const longUnits = parseInt(data.position.long.units, 10) || 0;
    const shortUnits = parseInt(data.position.short.units, 10) || 0;
    if (longUnits === 0 && shortUnits === 0) return null;
    return { ...data.position, longUnits, shortUnits };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("404")) return null;
    throw e;
  }
}

export interface PlaceOrderParams {
  instrument: string;
  units: number;
  takeProfit: number;
  stopLoss: number;
}

export async function placeMarketOrder(
  creds: OandaCredentials,
  params: PlaceOrderParams,
) {
  const precision = params.instrument.includes("JPY") ? 3 : 5;
  const order = {
    order: {
      units: String(params.units),
      instrument: params.instrument,
      timeInForce: "FOK",
      type: "MARKET",
      positionFill: "DEFAULT",
      takeProfitOnFill: {
        price: params.takeProfit.toFixed(precision),
      },
      stopLossOnFill: {
        price: params.stopLoss.toFixed(precision),
      },
    },
  };

  const data = (await oandaFetch(
    creds,
    `/v3/accounts/${creds.accountId}/orders`,
    { method: "POST", body: JSON.stringify(order) },
  )) as {
    orderFillTransaction?: {
      id: string;
      tradeOpened?: { tradeID: string; units: string; price: string };
      price?: string;
      instrument?: string;
    };
    orderCreateTransaction?: { id: string };
    orderRejectTransaction?: { rejectReason?: string };
  };

  if (data.orderRejectTransaction) {
    throw new Error(
      data.orderRejectTransaction.rejectReason || "Order rejected",
    );
  }

  return data;
}

/**
 * Replace (or set) take-profit / stop-loss dependent orders on an open trade.
 * Omit a field to leave that exit unchanged.
 */
export async function updateTradeExits(
  creds: OandaCredentials,
  tradeId: string,
  params: {
    takeProfit?: number;
    stopLoss?: number;
    instrument: string;
  },
) {
  const precision = params.instrument.includes("JPY") ? 3 : 5;
  const body: Record<string, unknown> = {};
  if (params.takeProfit != null) {
    body.takeProfit = {
      price: params.takeProfit.toFixed(precision),
      timeInForce: "GTC",
    };
  }
  if (params.stopLoss != null) {
    body.stopLoss = {
      price: params.stopLoss.toFixed(precision),
      timeInForce: "GTC",
    };
  }
  if (!Object.keys(body).length) {
    throw new Error("Nothing to update — provide takeProfit and/or stopLoss");
  }

  const data = (await oandaFetch(
    creds,
    `/v3/accounts/${creds.accountId}/trades/${encodeURIComponent(tradeId)}/orders`,
    { method: "PUT", body: JSON.stringify(body) },
  )) as {
    takeProfitOrderCancelTransaction?: { id?: string };
    takeProfitOrderTransaction?: { id?: string; price?: string };
    takeProfitOrderFillTransaction?: { id?: string };
    takeProfitOrderCreatedCancelTransaction?: { id?: string };
    stopLossOrderCancelTransaction?: { id?: string };
    stopLossOrderTransaction?: { id?: string; price?: string };
    stopLossOrderFillTransaction?: { id?: string };
    stopLossOrderCreatedCancelTransaction?: { id?: string };
    orderRejectTransaction?: { rejectReason?: string };
  };

  if (data.orderRejectTransaction) {
    throw new Error(
      data.orderRejectTransaction.rejectReason || "Exit order rejected",
    );
  }

  return data;
}

export async function getClosedTradesSince(
  creds: OandaCredentials,
  sinceIso: string,
) {
  const data = (await oandaFetch(
    creds,
    `/v3/accounts/${creds.accountId}/trades?state=CLOSED&count=100`,
  )) as {
    trades: Array<{
      id: string;
      instrument: string;
      price: string;
      averageClosePrice?: string;
      realizedPL: string;
      openTime: string;
      closeTime?: string;
      initialUnits: string;
    }>;
  };
  const since = new Date(sinceIso).getTime();
  return data.trades.filter((t) => {
    if (!t.closeTime) return false;
    return new Date(t.closeTime).getTime() >= since;
  });
}
