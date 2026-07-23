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

/** Default: 2.5-flash — current free-tier model (1.5 / 2.0 IDs are retired or quota-blocked). */
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export const GEMINI_MODEL_OPTIONS = [
  { value: "gemini-2.5-flash", label: "2.5 Flash (recommended)" },
  { value: "gemini-2.5-flash-lite", label: "2.5 Flash-Lite (higher free quota)" },
  { value: "gemini-2.5-pro", label: "2.5 Pro (heavier)" },
] as const;

const DEPRECATED_MODEL_MAP: Record<string, string> = {
  "gemini-1.5-flash": DEFAULT_GEMINI_MODEL,
  "gemini-1.5-pro": "gemini-2.5-pro",
  "gemini-2.0-flash": DEFAULT_GEMINI_MODEL,
  "gemini-1.5-flash-latest": DEFAULT_GEMINI_MODEL,
  "gemini-pro": DEFAULT_GEMINI_MODEL,
};

function resolveModel(model?: string | null): string {
  const raw =
    (model && model.trim()) || process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  return DEPRECATED_MODEL_MAP[raw] || raw;
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
  model?: string | null;
  /** Day = intraday structure; swing = multi-day structure */
  style?: "day" | "swing";
  /** Minimum reward/risk the bot will accept */
  minRr?: number;
}): Promise<TradeSignal> {
  const { apiKey, instrument, timeframe, candles, higherTfCandles, accountBalance } =
    params;
  const ai = new GoogleGenAI({ apiKey });
  const model = resolveModel(params.model);
  const style = params.style ?? "day";
  const minRr = Math.max(0.5, params.minRr ?? 1.5);
  const horizon =
    style === "swing"
      ? "SWING trade (hold days to weeks). Use wider recent swings (~20 bars) and next liquidity/structure as targets."
      : "DAY trade (intraday). Use tight recent swings (~10 bars) and nearby structure; targets should be reachable the same session.";

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
Trade style: ${style.toUpperCase()} — ${horizon}
Latest close: ${last?.close ?? "n/a"}
Account balance (approx): ${accountBalance ?? "unknown"}
Minimum risk/reward required: ${minRr}

Primary candles (most recent last):
${JSON.stringify(summarize(candles))}

${
  higherTfCandles?.length
    ? `Higher timeframe context candles:\n${JSON.stringify(summarize(higherTfCandles, 30))}`
    : ""
}

Decide BUY, SELL, or WAIT for a market entry NOW.
If BUY/SELL, provide absolute takeProfit and stopLoss prices suitable for this pair
(JPY pairs typically 2-3 decimal places; others ~5).

Exit rules (structure-based — do NOT invent fixed pip/ATR multiples):
- stopLoss: beyond the recent swing / invalidation that would prove the setup wrong (just past that high/low).
- takeProfit: at the next opposing swing, clear liquidity pool, or obvious structure level in the trade direction.
- Reward distance must be at least ${minRr}× the risk distance from entryHint (or latest close) to stopLoss.
- Prefer WAIT if unclear, choppy, or you cannot place structure exits that clear min R:R.

Respond ONLY with JSON:
{
  "bias": "BUY" | "SELL" | "WAIT",
  "confidence": number between 0 and 1,
  "rationale": "short explanation naming the structure used for TP/SL",
  "takeProfit": number or null,
  "stopLoss": number or null,
  "entryHint": number or null
}`;

  const response = await ai.models.generateContent({
    model,
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
  model?: string | null;
}): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: params.apiKey });
  const response = await ai.models.generateContent({
    model: resolveModel(params.model),
    contents: `Write a 2-sentence trading lesson after this closed forex trade.
Instrument: ${params.instrument}
Side: ${params.side}
Realized P/L: ${params.realizedPl}
Original rationale: ${params.rationale || "n/a"}
Be specific and practical. No markdown.`,
  });
  return (response.text || "").trim();
}
