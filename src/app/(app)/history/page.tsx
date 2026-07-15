"use client";

import { useCallback, useEffect, useState } from "react";

interface Trade {
  id: string;
  createdAt: string;
  source: string;
  outcome: string;
  instrument: string;
  side: string | null;
  units: number | null;
  entryPrice: number | null;
  takeProfit: number | null;
  stopLoss: number | null;
  confidence: number | null;
  rationale: string | null;
  realizedPl: number | null;
  skipReason: string | null;
  lesson: string | null;
  timeframe: string | null;
}

export default function HistoryPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [source, setSource] = useState("");
  const [outcome, setOutcome] = useState("");
  const [instrument, setInstrument] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [autoRuntime, setAutoRuntime] = useState<string>("");

  const load = useCallback(async () => {
    setError(null);
    const sp = new URLSearchParams();
    if (source) sp.set("source", source);
    if (outcome) sp.set("outcome", outcome);
    if (instrument) sp.set("instrument", instrument);
    const res = await fetch(`/api/trades/history?${sp.toString()}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to load");
      return;
    }
    setTrades(data.trades || []);
  }, [source, outcome, instrument]);

  useEffect(() => {
    void load();
    void (async () => {
      const res = await fetch("/api/auto-trade");
      if (res.ok) {
        const d = await res.json();
        setAutoRuntime(
          d.enabled
            ? `Auto on · ${d.runtime?.lastStatus || "—"}`
            : "Auto off",
        );
      }
    })();
  }, [load]);

  async function runAutoNow() {
    const res = await fetch("/api/auto-trade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "run_now" }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Run failed");
      return;
    }
    setAutoRuntime(`Triggered · ${data.runtime?.lastStatus}`);
    void load();
  }

  return (
    <div className="fade-up space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-3xl text-[var(--brand)]">History</h1>
          <p className="mt-1 text-[var(--ink-soft)]">
            Manual confirms, auto entries, and skipped scans — with AI notes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge badge-auto">{autoRuntime || "…"}</span>
          <button type="button" className="btn btn-ghost text-sm" onClick={() => void runAutoNow()}>
            Run auto scan now
          </button>
          <button type="button" className="btn btn-ghost text-sm" onClick={() => void load()}>
            Refresh
          </button>
        </div>
      </div>

      <div className="panel grid gap-3 p-4 md:grid-cols-4">
        <div>
          <label className="label">Source</label>
          <select className="select" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">All</option>
            <option value="manual">Manual</option>
            <option value="auto">Auto (AI)</option>
            <option value="strategy">Strategy</option>
          </select>
        </div>
        <div>
          <label className="label">Outcome</label>
          <select className="select" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <option value="">All</option>
            {["open", "win", "loss", "breakeven", "skipped", "error"].map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Instrument</label>
          <input
            className="input mono"
            placeholder="e.g. EUR_USD"
            value={instrument}
            onChange={(e) => setInstrument(e.target.value)}
          />
        </div>
        <div className="flex items-end">
          <button type="button" className="btn btn-primary w-full" onClick={() => void load()}>
            Filter
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      <div className="space-y-3">
        {trades.length === 0 && (
          <div className="panel p-6 text-[var(--ink-soft)]">No journal rows yet.</div>
        )}
        {trades.map((t) => (
          <article key={t.id} className="panel p-4 md:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`badge ${t.source === "auto" || t.source === "strategy" ? "badge-auto" : ""}`}>
                {t.source}
              </span>
              <span
                className={`badge ${
                  t.outcome === "win"
                    ? "badge-ok"
                    : t.outcome === "loss" || t.outcome === "error"
                      ? "badge-halt"
                      : ""
                }`}
              >
                {t.outcome}
              </span>
              <span className="mono font-semibold">{t.instrument}</span>
              {t.side && <span className="mono text-sm">{t.side}</span>}
              {t.timeframe && (
                <span className="text-xs text-[var(--ink-soft)]">{t.timeframe}</span>
              )}
              <span className="ml-auto text-xs text-[var(--ink-soft)]">
                {new Date(t.createdAt).toLocaleString()}
              </span>
            </div>
            <div className="mt-3 grid gap-2 text-sm md:grid-cols-4">
              <div>
                <span className="text-[var(--ink-soft)]">Units </span>
                <span className="mono">{t.units ?? "—"}</span>
              </div>
              <div>
                <span className="text-[var(--ink-soft)]">Entry </span>
                <span className="mono">{t.entryPrice ?? "—"}</span>
              </div>
              <div>
                <span className="text-[var(--ink-soft)]">TP/SL </span>
                <span className="mono">
                  {t.takeProfit ?? "—"} / {t.stopLoss ?? "—"}
                </span>
              </div>
              <div>
                <span className="text-[var(--ink-soft)]">P/L </span>
                <span className="mono font-semibold">
                  {t.realizedPl != null ? t.realizedPl.toFixed(2) : "—"}
                </span>
              </div>
            </div>
            {t.confidence != null && (
              <div className="mt-2 text-xs text-[var(--ink-soft)]">
                Confidence {(t.confidence * 100).toFixed(0)}%
              </div>
            )}
            {t.rationale && (
              <p className="mt-2 text-sm text-[var(--ink-soft)]">{t.rationale}</p>
            )}
            {t.skipReason && (
              <p className="mt-2 text-sm text-[var(--halt)]">Skip: {t.skipReason}</p>
            )}
            {t.lesson && (
              <p className="mt-2 border-t border-[var(--line)] pt-2 text-sm italic text-[var(--brand)]">
                Lesson: {t.lesson}
              </p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
