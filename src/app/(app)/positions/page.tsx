"use client";

import { useCallback, useEffect, useState } from "react";

interface Trade {
  id: string;
  instrument: string;
  price: string;
  currentUnits: string;
  unrealizedPL: string;
  openTime: string;
  takeProfitOrder?: { price: string };
  stopLossOrder?: { price: string };
}

export default function PositionsPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/oanda/positions");
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to load");
      return;
    }
    setTrades(data.trades || []);
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 20_000);
    return () => clearInterval(t);
  }, [load]);

  async function sendStatus(tradeId?: string) {
    setSendingId(tradeId || "all");
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/discord/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tradeId ? { tradeId } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send");
      setMsg(
        `Sent ${data.instrument} status to Discord (uPL ${Number(data.unrealizedPl).toFixed(2)})`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSendingId(null);
    }
  }

  return (
    <div className="fade-up space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-3xl text-[var(--brand)]">Open positions</h1>
          <p className="mt-1 text-[var(--ink-soft)]">
            Live open trades from your OANDA account.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-accent"
            disabled={!trades.length || sendingId != null}
            onClick={() => void sendStatus()}
          >
            {sendingId === "all" ? "Sending…" : "Send status to Discord"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => void load()}>
            Refresh
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      {msg && <p className="text-sm text-[var(--ok)]">{msg}</p>}

      {trades.length === 0 && !error && (
        <div className="panel p-6 text-[var(--ink-soft)]">No open trades.</div>
      )}

      <div className="overflow-x-auto panel">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-[var(--line)] text-xs uppercase tracking-wider text-[var(--ink-soft)]">
            <tr>
              <th className="p-3">Instrument</th>
              <th className="p-3">Units</th>
              <th className="p-3">Entry</th>
              <th className="p-3">uPL</th>
              <th className="p-3">TP</th>
              <th className="p-3">SL</th>
              <th className="p-3">Opened</th>
              <th className="p-3">Discord</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => (
              <tr key={t.id} className="border-b border-[var(--line)] last:border-0">
                <td className="p-3 mono font-semibold">{t.instrument}</td>
                <td className="p-3 mono">{t.currentUnits}</td>
                <td className="p-3 mono">{t.price}</td>
                <td className="p-3 mono">{t.unrealizedPL}</td>
                <td className="p-3 mono">{t.takeProfitOrder?.price ?? "—"}</td>
                <td className="p-3 mono">{t.stopLossOrder?.price ?? "—"}</td>
                <td className="p-3 text-[var(--ink-soft)]">
                  {new Date(t.openTime).toLocaleString()}
                </td>
                <td className="p-3">
                  <button
                    type="button"
                    className="btn btn-ghost text-xs"
                    disabled={sendingId != null}
                    onClick={() => void sendStatus(t.id)}
                  >
                    {sendingId === t.id ? "…" : "Share"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
