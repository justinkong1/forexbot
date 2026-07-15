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
  name?: string;
  id?: string;
}

interface StrategyRow {
  id: string;
  name: string;
  bias: "BUY" | "SELL" | "WAIT";
  confidence: number;
  rationale: string;
  takeProfit: number | null;
  stopLoss: number | null;
}

interface PendingTrade {
  source: "manual" | "strategy";
  title: string;
  signal: Signal;
  entry: number;
  lastClose: number;
  suggestedUnits: number | null;
  riskAmount: number | null;
  rr: number | null;
  strategyRows?: StrategyRow[];
  buyVotes?: number;
  sellVotes?: number;
}

export default function TradePage() {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [instrument, setInstrument] = useState("EUR_USD");
  const [timeframe, setTimeframe] = useState("H1");
  const [candles, setCandles] = useState<ChartCandle[]>([]);
  const [pending, setPending] = useState<PendingTrade | null>(null);
  const [tp, setTp] = useState("");
  const [sl, setSl] = useState("");
  const [units, setUnits] = useState("");
  const [loadingChart, setLoadingChart] = useState(false);
  const [scanning, setScanning] = useState(false);
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

  function applyPending(p: PendingTrade) {
    setPending(p);
    if (p.signal.takeProfit != null) setTp(String(p.signal.takeProfit));
    if (p.signal.stopLoss != null) setSl(String(p.signal.stopLoss));
    if (p.suggestedUnits != null) setUnits(String(Math.abs(p.suggestedUnits)));
  }

  async function scanStrategies() {
    setScanning(true);
    setError(null);
    setSuccess(null);
    setPending(null);
    try {
      const res = await fetch("/api/strategy/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instrument, timeframe }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Strategy scan failed");
      if (data.limits?.halted) {
        setHalted(true);
        setHaltMsg(data.limits.message);
      }
      const consensus = data.consensus as Signal | null;
      applyPending({
        source: "strategy",
        title: consensus
          ? `Strategy confluence · ${consensus.bias}`
          : "Strategy scan · no setup",
        signal: consensus || {
          bias: "WAIT",
          confidence: 0,
          rationale: `No consensus (BUY ${data.buyVotes}, SELL ${data.sellVotes}). Check individual strategies below.`,
          takeProfit: null,
          stopLoss: null,
        },
        entry: data.entry,
        lastClose: data.lastClose,
        suggestedUnits: data.suggestedUnits,
        riskAmount: data.riskAmount,
        rr: data.rr,
        strategyRows: data.signals || [],
        buyVotes: data.buyVotes,
        sellVotes: data.sellVotes,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Strategy scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function analyzeAi() {
    setAnalyzing(true);
    setError(null);
    setSuccess(null);
    setPending(null);
    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instrument, timeframe }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analyze failed");
      if (data.limits?.halted) {
        setHalted(true);
        setHaltMsg(data.limits.message);
      }
      applyPending({
        source: "manual",
        title: "Gemini AI signal",
        signal: data.signal,
        entry: data.entry,
        lastClose: data.lastClose,
        suggestedUnits: data.suggestedUnits,
        riskAmount: data.riskAmount,
        rr: data.rr,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analyze failed");
    } finally {
      setAnalyzing(false);
    }
  }

  async function placeTrade() {
    if (!pending || pending.signal.bias === "WAIT") return;
    setPlacing(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/trades/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: pending.source,
          instrument,
          timeframe,
          side: pending.signal.bias,
          takeProfit: Number(tp),
          stopLoss: Number(sl),
          units: units ? Number(units) : undefined,
          confidence: pending.signal.confidence,
          rationale: pending.signal.rationale,
          entryPrice: pending.entry,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Order failed");
      setSuccess(
        `Order filled @ ${data.fillPrice} · ${Math.abs(data.units)} units`,
      );
      setPending(null);
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
            Scan built-in strategies (no AI) or ask Gemini — then confirm the entry.
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
              setPending(null);
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
              setPending(null);
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
          className="btn btn-primary"
          onClick={() => void scanStrategies()}
          disabled={scanning || halted}
        >
          {scanning ? "Scanning…" : "Scan strategies"}
        </button>
        <button
          type="button"
          className="btn btn-accent"
          onClick={() => void analyzeAi()}
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

      {pending && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="panel space-y-3 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="display text-xl">{pending.title}</h2>
              <span
                className={`badge ${
                  pending.signal.bias === "WAIT"
                    ? ""
                    : pending.signal.bias === "BUY"
                      ? "badge-ok"
                      : "badge-halt"
                }`}
              >
                {pending.signal.bias}
              </span>
              {pending.source === "strategy" && (
                <span className="badge badge-auto">local rules</span>
              )}
              <span className="mono text-sm text-[var(--ink-soft)]">
                conf {(pending.signal.confidence * 100).toFixed(0)}%
              </span>
            </div>
            <p className="text-sm leading-relaxed text-[var(--ink-soft)]">
              {pending.signal.rationale}
            </p>
            {pending.strategyRows && (
              <div className="space-y-2 border-t border-[var(--line)] pt-3">
                <div className="text-xs uppercase tracking-wider text-[var(--ink-soft)]">
                  Per-strategy · BUY {pending.buyVotes} / SELL {pending.sellVotes}
                </div>
                {pending.strategyRows.map((row) => (
                  <div
                    key={row.id}
                    className="flex flex-wrap items-start justify-between gap-2 text-sm"
                  >
                    <div>
                      <span className="font-semibold">{row.name}</span>
                      <span className="ml-2 badge">{row.bias}</span>
                      <p className="mt-1 text-xs text-[var(--ink-soft)]">
                        {row.rationale}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="label">Entry</div>
                <div className="mono">{pending.entry}</div>
              </div>
              <div>
                <div className="label">Last close</div>
                <div className="mono">{pending.lastClose}</div>
              </div>
              <div>
                <div className="label">Suggested R:R</div>
                <div className="mono">
                  {pending.rr != null ? pending.rr.toFixed(2) : "—"}
                </div>
              </div>
              <div>
                <div className="label">$ at SL</div>
                <div className="mono">
                  {pending.riskAmount != null
                    ? pending.riskAmount.toFixed(2)
                    : "—"}
                </div>
              </div>
              {pending.suggestedUnits != null && (
                <div className="col-span-2">
                  <div className="label">Suggested units (from sizing mode)</div>
                  <div className="mono text-lg font-semibold">
                    {Math.abs(pending.suggestedUnits)}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="panel space-y-3 p-5">
            <h2 className="display text-xl">Confirm order</h2>
            {pending.signal.bias === "WAIT" ? (
              <p className="text-sm text-[var(--ink-soft)]">
                No actionable setup — wait for the next bar or try another pair/TF.
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
                    : `Confirm ${pending.signal.bias} market order`}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
