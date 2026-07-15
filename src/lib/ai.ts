import { GoogleGenAI } from "@google/genai";
import type { Candle } from "./oanda";

export type SignalBias = "BUY" | "SELL" | "WAIT";

export interface TradeSignal {
  bias: SignalBias;
  confidence: number;
  rationale: string;
  takeProfit: number | null;
  stopLoss: number | null;
  entryHint: number | null;
}

function stripJson(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

export async function analyzePair(params: {
  apiKey: string;
  instrument: string;
  timeframe: string;
  candles: Candle[];
  higherTfCandles?: Candle[];
  accountBalance?: number;
}): Promise<TradeSignal> {
  const { apiKey, instrument, timeframe, candles, higherTfCandles, accountBalance } =
    params;
  const ai = new GoogleGenAI({ apiKey });

  const summarize = (cs: Candle[], n = 40) =>
    cs.slice(-n).map((c) => ({
      t: c.time,
      o: c.open,
      h: c.high,
      l: c.low,
      c: c.close,
      v: c.volume,
    }));

  const last = candles[candles.length - 1];
  const prompt = `You are a cautious forex trading analyst for OANDA market orders.
Instrument: ${instrument}
Primary timeframe: ${timeframe}
Latest close: ${last?.close ?? "n/a"}
Account balance (approx): ${accountBalance ?? "unknown"}

Primary candles (most recent last):
${JSON.stringify(summarize(candles))}

${
  higherTfCandles?.length
    ? `Higher timeframe context candles:\n${JSON.stringify(summarize(higherTfCandles, 30))}`
    : ""
}

Decide BUY, SELL, or WAIT for a market entry NOW.
If BUY/SELL, provide absolute takeProfit and stopLoss prices suitable for this pair
(JPY pairs typically 2-3 decimal places; others ~5). Prefer at least 1:1 risk/reward.
Prefer WAIT if unclear or choppy.

Respond ONLY with JSON:
{
  "bias": "BUY" | "SELL" | "WAIT",
  "confidence": number between 0 and 1,
  "rationale": "short explanation",
  "takeProfit": number or null,
  "stopLoss": number or null,
  "entryHint": number or null
}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: prompt,
  });

  const text = response.text || "";
  const parsed = JSON.parse(stripJson(text)) as TradeSignal;

  if (!["BUY", "SELL", "WAIT"].includes(parsed.bias)) {
    parsed.bias = "WAIT";
  }
  parsed.confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
  parsed.rationale = String(parsed.rationale || "");
  parsed.takeProfit =
    parsed.takeProfit == null ? null : Number(parsed.takeProfit);
  parsed.stopLoss = parsed.stopLoss == null ? null : Number(parsed.stopLoss);
  parsed.entryHint =
    parsed.entryHint == null ? null : Number(parsed.entryHint);

  return parsed;
}

export async function postTradeLesson(params: {
  apiKey: string;
  instrument: string;
  side: string;
  realizedPl: number;
  rationale?: string | null;
}): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: params.apiKey });
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: `Write a 2-sentence trading lesson after this closed forex trade.
Instrument: ${params.instrument}
Side: ${params.side}
Realized P/L: ${params.realizedPl}
Original rationale: ${params.rationale || "n/a"}
Be specific and practical. No markdown.`,
  });
  return (response.text || "").trim();
}
