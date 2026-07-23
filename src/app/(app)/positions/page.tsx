"use client";

import { useCallback, useEffect, useState } from "react";
import { readJson } from "@/lib/http";
import {
  outcomeMoney,
  priceFromReward,
  priceFromRisk,
} from "@/lib/risk";

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

interface ExitDraft {
  tpPrice: string;
  slPrice: string;
  youMake: string;
  youLose: string;
}

function moneyLabel(n: number | null, sign: "+" | "−"): string {
  if (n == null) return "—";
  return `${sign}${n.toFixed(2)}`;
}

function tradeSide(units: number): "BUY" | "SELL" {
  return units < 0 ? "SELL" : "BUY";
}

function draftFromTrade(t: Trade): ExitDraft {
  const entry = Number(t.price);
  const units = Number(t.currentUnits);
  const tp = t.takeProfitOrder?.price ? Number(t.takeProfitOrder.price) : NaN;
  const sl = t.stopLossOrder?.price ? Number(t.stopLossOrder.price) : NaN;
  const side = tradeSide(units);
  const outcomes =
    Number.isFinite(entry) && Number.isFinite(units) && units !== 0
      ? outcomeMoney({
          units,
          entry,
          takeProfit: Number.isFinite(tp) ? tp : null,
          stopLoss: Number.isFinite(sl) ? sl : null,
          side,
        })
      : { youMake: null, youLose: null, rr: null };

  return {
    tpPrice: Number.isFinite(tp) ? String(tp) : "",
    slPrice: Number.isFinite(sl) ? String(sl) : "",
    youMake:
      outcomes.youMake != null ? outcomes.youMake.toFixed(2) : "",
    youLose:
      outcomes.youLose != null ? outcomes.youLose.toFixed(2) : "",
  };
}

export default function PositionsPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ExitDraft | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/oanda/positions");
    const data = await readJson<{ trades?: Trade[] }>(res);
    if (!res.ok) {
      setError(data.error || "Failed to load");
      return;
    }
    setTrades(data.trades || []);
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => {
      // Don't clobber an in-progress edit with a refresh
      if (editingId) return;
      void load();
    }, 20_000);
    return () => clearInterval(t);
  }, [load, editingId]);

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
      const data = await readJson<{
        instrument?: string;
        unrealizedPl?: number;
      }>(res);
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

  function startEdit(t: Trade) {
    setEditingId(t.id);
    setDraft(draftFromTrade(t));
    setRowError(null);
    setMsg(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
    setRowError(null);
  }

  function updateFromTpPrice(t: Trade, value: string) {
    if (!draft) return;
    const entry = Number(t.price);
    const units = Number(t.currentUnits);
    const side = tradeSide(units);
    const tp = Number(value);
    const outcomes = outcomeMoney({
      units,
      entry,
      takeProfit: Number.isFinite(tp) ? tp : null,
      stopLoss: Number(draft.slPrice) || null,
      side,
    });
    setDraft({
      ...draft,
      tpPrice: value,
      youMake:
        outcomes.youMake != null ? outcomes.youMake.toFixed(2) : draft.youMake,
    });
  }

  function updateFromSlPrice(t: Trade, value: string) {
    if (!draft) return;
    const entry = Number(t.price);
    const units = Number(t.currentUnits);
    const side = tradeSide(units);
    const sl = Number(value);
    const outcomes = outcomeMoney({
      units,
      entry,
      takeProfit: Number(draft.tpPrice) || null,
      stopLoss: Number.isFinite(sl) ? sl : null,
      side,
    });
    setDraft({
      ...draft,
      slPrice: value,
      youLose:
        outcomes.youLose != null ? outcomes.youLose.toFixed(2) : draft.youLose,
    });
  }

  function updateFromYouMake(t: Trade, value: string) {
    if (!draft) return;
    const entry = Number(t.price);
    const units = Number(t.currentUnits);
    const side = tradeSide(units);
    const dollars = Number(value);
    const tp =
      Number.isFinite(dollars) && dollars > 0
        ? priceFromReward({
            side,
            entry,
            units,
            youMake: dollars,
            instrument: t.instrument,
          })
        : null;
    setDraft({
      ...draft,
      youMake: value,
      tpPrice: tp != null ? String(tp) : draft.tpPrice,
    });
  }

  function updateFromYouLose(t: Trade, value: string) {
    if (!draft) return;
    const entry = Number(t.price);
    const units = Number(t.currentUnits);
    const side = tradeSide(units);
    const dollars = Number(value);
    const sl =
      Number.isFinite(dollars) && dollars > 0
        ? priceFromRisk({
            side,
            entry,
            units,
            youLose: dollars,
            instrument: t.instrument,
          })
        : null;
    setDraft({
      ...draft,
      youLose: value,
      slPrice: sl != null ? String(sl) : draft.slPrice,
    });
  }

  async function saveExits(t: Trade) {
    if (!draft) return;
    setSavingId(t.id);
    setRowError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/oanda/trades/exits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tradeId: t.id,
          takeProfit: draft.tpPrice === "" ? undefined : Number(draft.tpPrice),
          stopLoss: draft.slPrice === "" ? undefined : Number(draft.slPrice),
        }),
      });
      const data = await readJson<{
        takeProfit?: number;
        stopLoss?: number;
        youMake?: number;
        youLose?: number;
      }>(res);
      if (!res.ok) throw new Error(data.error || "Failed to update exits");
      setMsg(
        `Updated ${t.instrument} exits · You make ${
          data.youMake != null ? `+${data.youMake.toFixed(2)}` : "—"
        } · You lose ${
          data.youLose != null ? `−${data.youLose.toFixed(2)}` : "—"
        }`,
      );
      setEditingId(null);
      setDraft(null);
      await load();
    } catch (e) {
      setRowError(e instanceof Error ? e.message : "Failed to update exits");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="fade-up space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-3xl text-[var(--brand)]">Open positions</h1>
          <p className="mt-1 text-[var(--ink-soft)]">
            Live open trades from your OANDA account. Edit exits by price or by
            the money you want to make / lose.
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
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void load()}
            disabled={editingId != null}
          >
            Refresh
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      {msg && <p className="text-sm text-[var(--ok)]">{msg}</p>}

      {trades.length === 0 && !error && (
        <div className="panel p-6 text-[var(--ink-soft)]">No open trades.</div>
      )}

      <div className="space-y-3">
        {trades.map((t) => {
          const entry = Number(t.price);
          const units = Number(t.currentUnits);
          const tp = t.takeProfitOrder?.price
            ? Number(t.takeProfitOrder.price)
            : null;
          const sl = t.stopLossOrder?.price
            ? Number(t.stopLossOrder.price)
            : null;
          const side = tradeSide(units);
          const outcomes =
            Number.isFinite(entry) && Number.isFinite(units) && units !== 0
              ? outcomeMoney({
                  units,
                  entry,
                  takeProfit: tp != null && Number.isFinite(tp) ? tp : null,
                  stopLoss: sl != null && Number.isFinite(sl) ? sl : null,
                  side,
                })
              : { youMake: null, youLose: null, rr: null };
          const isEditing = editingId === t.id && draft != null;

          return (
            <div key={t.id} className="panel overflow-x-auto p-0">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead className="border-b border-[var(--line)] text-xs uppercase tracking-wider text-[var(--ink-soft)]">
                  <tr>
                    <th className="p-3">Instrument</th>
                    <th className="p-3">Units</th>
                    <th className="p-3">Entry</th>
                    <th className="p-3">uPL</th>
                    <th className="p-3">TP</th>
                    <th className="p-3">SL</th>
                    <th className="p-3">You make</th>
                    <th className="p-3">You lose</th>
                    <th className="p-3">Opened</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-3 mono font-semibold">{t.instrument}</td>
                    <td className="p-3 mono">{t.currentUnits}</td>
                    <td className="p-3 mono">{t.price}</td>
                    <td className="p-3 mono">{t.unrealizedPL}</td>
                    <td className="p-3 mono">{t.takeProfitOrder?.price ?? "—"}</td>
                    <td className="p-3 mono">{t.stopLossOrder?.price ?? "—"}</td>
                    <td className="p-3 mono font-semibold text-[var(--ok)]">
                      {moneyLabel(outcomes.youMake, "+")}
                    </td>
                    <td className="p-3 mono font-semibold text-[var(--danger)]">
                      {moneyLabel(outcomes.youLose, "−")}
                    </td>
                    <td className="p-3 text-[var(--ink-soft)]">
                      {new Date(t.openTime).toLocaleString()}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-2">
                        {!isEditing && (
                          <button
                            type="button"
                            className="btn btn-ghost text-xs"
                            onClick={() => startEdit(t)}
                          >
                            Edit exits
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-ghost text-xs"
                          disabled={sendingId != null}
                          onClick={() => void sendStatus(t.id)}
                        >
                          {sendingId === t.id ? "…" : "Share"}
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>

              {isEditing && draft && (
                <div className="space-y-3 border-t border-[var(--line)] bg-[rgba(12,27,30,0.03)] p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="display text-lg">Edit exits · {side}</h3>
                    <p className="text-xs text-[var(--ink-soft)]">
                      Type a dollar amount (e.g. 300) and the price updates, or
                      edit the price and the dollars update.
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <label className="label">Take profit (price)</label>
                      <input
                        className="input mono"
                        value={draft.tpPrice}
                        onChange={(e) => updateFromTpPrice(t, e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label">You make ($)</label>
                      <input
                        className="input mono"
                        value={draft.youMake}
                        onChange={(e) => updateFromYouMake(t, e.target.value)}
                        placeholder="e.g. 300"
                      />
                    </div>
                    <div>
                      <label className="label">Stop loss (price)</label>
                      <input
                        className="input mono"
                        value={draft.slPrice}
                        onChange={(e) => updateFromSlPrice(t, e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label">You lose ($)</label>
                      <input
                        className="input mono"
                        value={draft.youLose}
                        onChange={(e) => updateFromYouLose(t, e.target.value)}
                        placeholder="e.g. 150"
                      />
                    </div>
                  </div>
                  {rowError && editingId === t.id && (
                    <p className="text-sm text-[var(--danger)]">{rowError}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={savingId === t.id}
                      onClick={() => void saveExits(t)}
                    >
                      {savingId === t.id ? "Saving…" : "Save exits"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={savingId === t.id}
                      onClick={cancelEdit}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
