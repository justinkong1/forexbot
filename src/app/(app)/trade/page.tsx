"use client";

import { useCallback, useEffect, useState } from "react";
import { CandleChart, type ChartCandle } from "@/components/CandleChart";

interface Instrument {
  name: string;
  displayName: string;
}

interface Signal {
  bias: "BUY" | "SELL" | "WAIT";
  confidence: number;
  rationale: string;
  takeProfit: number | null;
  stopLoss: number | null;
  entryHint: number | null;
}

interface Analysis {
  signal: Signal;
  entry: number;
  suggestedUnits: number | null;
  riskAmount: number | null;
  rr: number | null;
  lastClose: number;
  balance: number;
  limits?: { halted: boolean; message: string | null };
}

export default function TradePage() {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [instrument, setInstrument] = useState("EUR_USD");
  const [timeframe, setTimeframe] = useState("H1");
  const [candles, setCandles] = useState<ChartCandle[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [tp, setTp] = useState("");
  const [sl, setSl] = useState("");
  const [units, setUnits] = useState("");
  const [loadingChart, setLoadingChart] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [halted, setHalted] = useState(false);
  const [haltMsg, setHaltMsg] = useState<string | null>(null);

  const loadInstruments = useCallback(async () => {
    const res = await fetch("/api/oanda/instruments");
    if (!res.ok) return;
    const data = await res.json();
    setInstruments(data.instruments || []);
  }, []);

  const loadCandles = useCallback(async () => {
    setLoadingChart(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/oanda/candles?instrument=${encodeURIComponent(instrument)}&granularity=${timeframe}&count=120`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load candles");
      setCandles(data.candles || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chart error");
    } finally {
      setLoadingChart(false);
    }
  }, [instrument, timeframe]);

  const loadLimits = useCallback(async () => {
    const res = await fetch("/api/limits/status");
    if (!res.ok) return;
    const data = await res.json();
    setHalted(!!data.halted);
    setHaltMsg(data.message);
  }, []);

  useEffect(() => {
    void loadInstruments();
    void loadLimits();
  }, [loadInstruments, loadLimits]);

  useEffect(() => {
    void loadCandles();
  }, [loadCandles]);

  async function analyze() {
    setAnalyzing(true);
    setError(null);
    setSuccess(null);
    setAnalysis(null);
    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instrument, timeframe }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analyze failed");
      setAnalysis(data);
      if (data.limits?.halted) {
        setHalted(true);
        setHaltMsg(data.limits.message);
      }
      if (data.signal?.takeProfit != null) setTp(String(data.signal.takeProfit));
      if (data.signal?.stopLoss != null) setSl(String(data.signal.stopLoss));
      if (data.suggestedUnits != null)
        setUnits(String(Math.abs(data.suggestedUnits)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analyze failed");
    } finally {
      setAnalyzing(false);
    }
  }

  async function placeTrade() {
    if (!analysis || analysis.signal.bias === "WAIT") return;
    setPlacing(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/trades/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instrument,
          timeframe,
          side: analysis.signal.bias,
          takeProfit: Number(tp),
          stopLoss: Number(sl),
          units: units ? Number(units) : undefined,
          confidence: analysis.signal.confidence,
          rationale: analysis.signal.rationale,
          entryPrice: analysis.entry,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Order failed");
      setSuccess(
        `Order filled @ ${data.fillPrice} · ${Math.abs(data.units)} units`,
      );
      setAnalysis(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Order failed");
    } finally {
      setPlacing(false);
      void loadLimits();
    }
  }

  return (
    <div className="fade-up space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-3xl text-[var(--brand)]">Trade desk</h1>
          <p className="mt-1 text-[var(--ink-soft)]">
            Choose a pair, read the tape, ask the AI, confirm the entry.
          </p>
        </div>
        {halted ? (
          <span className="badge badge-halt">{haltMsg || "Halted"}</span>
        ) : (
          <span className="badge badge-ok">Limits clear</span>
        )}
      </div>

      <div className="panel flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[10rem] flex-1">
          <label className="label">Pair</label>
          <select
            className="select"
            value={instrument}
            onChange={(e) => {
              setInstrument(e.target.value);
              setAnalysis(null);
            }}
          >
            {(instruments.length
              ? instruments
              : [{ name: instrument, displayName: instrument }]
            ).map((i) => (
              <option key={i.name} value={i.name}>
                {i.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[8rem]">
          <label className="label">Timeframe</label>
          <select
            className="select"
            value={timeframe}
            onChange={(e) => {
              setTimeframe(e.target.value);
              setAnalysis(null);
            }}
          >
            {["M5", "M15", "H1", "H4", "D"].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => void loadCandles()}
          disabled={loadingChart}
        >
          {loadingChart ? "Loading…" : "Refresh chart"}
        </button>
        <button
          type="button"
          className="btn btn-accent"
          onClick={() => void analyze()}
          disabled={analyzing || halted}
        >
          {analyzing ? "Analyzing…" : "Analyze with AI"}
        </button>
      </div>

      <div className="panel p-3 md:p-4">
        {candles.length > 0 ? (
          <CandleChart candles={candles} />
        ) : (
          <div className="flex h-[420px] items-center justify-center text-[var(--ink-soft)]">
            {loadingChart ? "Loading candles…" : "No candle data — check Settings"}
          </div>
        )}
      </div>

      {error && <p className="text-sm font-medium text-[var(--danger)]">{error}</p>}
      {success && <p className="text-sm font-medium text-[var(--ok)]">{success}</p>}

      {analysis && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="panel space-y-3 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="display text-xl">AI signal</h2>
              <span
                className={`badge ${
                  analysis.signal.bias === "WAIT"
                    ? ""
                    : analysis.signal.bias === "BUY"
                      ? "badge-ok"
                      : "badge-halt"
                }`}
              >
                {analysis.signal.bias}
              </span>
              <span className="mono text-sm text-[var(--ink-soft)]">
                conf {(analysis.signal.confidence * 100).toFixed(0)}%
              </span>
            </div>
            <p className="text-sm leading-relaxed text-[var(--ink-soft)]">
              {analysis.signal.rationale}
            </p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="label">Entry hint</div>
                <div className="mono">{analysis.entry}</div>
              </div>
              <div>
                <div className="label">Last close</div>
                <div className="mono">{analysis.lastClose}</div>
              </div>
              <div>
                <div className="label">Suggested R:R</div>
                <div className="mono">
                  {analysis.rr != null ? analysis.rr.toFixed(2) : "—"}
                </div>
              </div>
              <div>
                <div className="label">$ risk</div>
                <div className="mono">
                  {analysis.riskAmount != null
                    ? analysis.riskAmount.toFixed(2)
                    : "—"}
                </div>
              </div>
            </div>
          </div>

          <div className="panel space-y-3 p-5">
            <h2 className="display text-xl">Confirm order</h2>
            {analysis.signal.bias === "WAIT" ? (
              <p className="text-sm text-[var(--ink-soft)]">
                AI recommends waiting — no trade to place.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="label">Units</label>
                    <input
                      className="input mono"
                      value={units}
                      onChange={(e) => setUnits(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label">Take profit</label>
                    <input
                      className="input mono"
                      value={tp}
                      onChange={(e) => setTp(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label">Stop loss</label>
                    <input
                      className="input mono"
                      value={sl}
                      onChange={(e) => setSl(e.target.value)}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-primary w-full"
                  disabled={placing || halted}
                  onClick={() => void placeTrade()}
                >
                  {placing
                    ? "Placing…"
                    : `Confirm ${analysis.signal.bias} market order`}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
