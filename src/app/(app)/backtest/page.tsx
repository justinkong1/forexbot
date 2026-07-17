"use client";

import { useCallback, useEffect, useState } from "react";

interface Instrument {
  name: string;
  displayName: string;
}

interface StrategyStats {
  strategyId: string;
  name: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  totalR: number;
  expectancyR: number | null;
  profitFactor: number | null;
  maxDrawdownR: number;
  verdict: "profitable" | "losing" | "insufficient";
}

interface BacktestTrade {
  strategyId: string;
  side: string;
  entryTime: string;
  entryPrice: number;
  takeProfit: number;
  stopLoss: number;
  exitTime: string | null;
  resultR: number;
  outcome: string;
}

interface BacktestResult {
  instrument: string;
  timeframe: string;
  bars: number;
  from: string | null;
  to: string | null;
  strategies: StrategyStats[];
  trades: BacktestTrade[];
}

function verdictLabel(s: StrategyStats): { text: string; cls: string } {
  if (s.verdict === "profitable") {
    return {
      text: `Would have made +${s.totalR.toFixed(1)}R over this period`,
      cls: "badge-ok",
    };
  }
  if (s.verdict === "losing") {
    return {
      text: `Avoid: lost ${s.totalR.toFixed(1)}R historically`,
      cls: "badge-halt",
    };
  }
  return { text: "Not enough signals to judge", cls: "" };
}

export default function BacktestPage() {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [instrument, setInstrument] = useState("EUR_USD");
  const [timeframe, setTimeframe] = useState("H1");
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadInstruments = useCallback(async () => {
    const res = await fetch("/api/oanda/instruments");
    if (!res.ok) return;
    const data = await res.json();
    setInstruments(data.instruments || []);
  }, []);

  useEffect(() => {
    void loadInstruments();
  }, [loadInstruments]);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instrument, timeframe }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Backtest failed");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backtest failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="fade-up space-y-5">
      <div>
        <h1 className="display text-3xl text-[var(--brand)]">Backtest</h1>
        <p className="mt-1 text-[var(--ink-soft)]">
          Replay each strategy on recent history to see which ones actually
          made money before trusting them with real trades.
        </p>
      </div>

      <div className="panel border-l-4 border-l-[var(--accent-2)] p-4 text-sm text-[var(--ink-soft)]">
        Past results don&apos;t guarantee future results — use this to filter
        out obviously bad setups, not as a promise of profit.
      </div>

      <div className="panel flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[10rem] flex-1">
          <label className="label">Pair</label>
          <select
            className="select"
            value={instrument}
            onChange={(e) => setInstrument(e.target.value)}
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
            onChange={(e) => setTimeframe(e.target.value)}
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
          className="btn btn-primary"
          onClick={() => void run()}
          disabled={running}
        >
          {running ? "Testing… (about 10s)" : "Run backtest"}
        </button>
      </div>

      {error && <p className="text-sm font-medium text-[var(--danger)]">{error}</p>}

      {result && (
        <>
          <p className="text-sm text-[var(--ink-soft)]">
            Tested {result.bars} bars of {result.instrument} {result.timeframe}
            {result.from &&
              ` (${new Date(result.from).toLocaleDateString()} → ${
                result.to ? new Date(result.to).toLocaleDateString() : "now"
              })`}
            . R = one unit of risk; +2R means the trade won twice what it
            risked.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            {result.strategies.map((s) => {
              const v = verdictLabel(s);
              return (
                <div key={s.strategyId} className="panel space-y-3 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="display text-lg">{s.name}</h2>
                    <span className={`badge ${v.cls}`}>{v.text}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <div className="label">Trades</div>
                      <div className="mono">{s.trades}</div>
                    </div>
                    <div>
                      <div className="label">Win rate</div>
                      <div className="mono">
                        {s.winRate != null
                          ? `${(s.winRate * 100).toFixed(0)}%`
                          : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="label">Total R</div>
                      <div
                        className={`mono font-semibold ${
                          s.totalR > 0
                            ? "text-[var(--ok)]"
                            : s.totalR < 0
                              ? "text-[var(--danger)]"
                              : ""
                        }`}
                      >
                        {s.totalR > 0 ? "+" : ""}
                        {s.totalR.toFixed(1)}
                      </div>
                    </div>
                    <div>
                      <div className="label">Avg R / trade</div>
                      <div className="mono">
                        {s.expectancyR != null ? s.expectancyR.toFixed(2) : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="label">Profit factor</div>
                      <div className="mono">
                        {s.profitFactor != null ? s.profitFactor : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="label">Max drawdown</div>
                      <div className="mono">{s.maxDrawdownR.toFixed(1)}R</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {result.trades.length > 0 && (
            <div className="overflow-x-auto panel">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-[var(--line)] text-xs uppercase tracking-wider text-[var(--ink-soft)]">
                  <tr>
                    <th className="p-3">Strategy</th>
                    <th className="p-3">Side</th>
                    <th className="p-3">Entry</th>
                    <th className="p-3">TP / SL</th>
                    <th className="p-3">Result</th>
                    <th className="p-3">When</th>
                  </tr>
                </thead>
                <tbody>
                  {[...result.trades].reverse().map((t, idx) => (
                    <tr
                      key={`${t.strategyId}-${t.entryTime}-${idx}`}
                      className="border-b border-[var(--line)] last:border-0"
                    >
                      <td className="p-3">{t.strategyId}</td>
                      <td className="p-3 mono">{t.side}</td>
                      <td className="p-3 mono">{t.entryPrice}</td>
                      <td className="p-3 mono">
                        {t.takeProfit} / {t.stopLoss}
                      </td>
                      <td
                        className={`p-3 mono font-semibold ${
                          t.resultR > 0
                            ? "text-[var(--ok)]"
                            : t.resultR < 0
                              ? "text-[var(--danger)]"
                              : ""
                        }`}
                      >
                        {t.outcome === "open"
                          ? "open"
                          : `${t.resultR > 0 ? "+" : ""}${t.resultR.toFixed(2)}R`}
                      </td>
                      <td className="p-3 text-[var(--ink-soft)]">
                        {new Date(t.entryTime).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
