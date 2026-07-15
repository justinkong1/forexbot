"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface Account {
  balance?: string;
  NAV?: string;
  unrealizedPL?: string;
  currency?: string;
  openTradeCount?: string;
}

interface Limits {
  halted: boolean;
  reason: string | null;
  message: string | null;
  dayPl: number;
  weekPl: number;
  dailyMaxLoss: number | null;
  dailyMaxWin: number | null;
  weeklyMaxLoss: number | null;
  weeklyMaxWin: number | null;
}

interface AutoStatus {
  enabled: boolean;
  runtime: { lastStatus: string; lastRunAt: string | null; lastError: string | null };
}

function gaugePct(pl: number, maxLoss: number | null, maxWin: number | null) {
  const span = Math.max(Math.abs(maxLoss || 0), Math.abs(maxWin || 0), 1);
  return Math.min(100, Math.max(0, ((pl + span) / (2 * span)) * 100));
}

export default function DashboardPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [auto, setAuto] = useState<AutoStatus | null>(null);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [accRes, limRes, autoRes, setRes] = await Promise.all([
        fetch("/api/oanda/account"),
        fetch("/api/limits/status"),
        fetch("/api/auto-trade"),
        fetch("/api/settings"),
      ]);
      const settings = await setRes.json();
      if (!settings.hasOandaToken) {
        setConfigured(false);
        setAccount(null);
      } else {
        setConfigured(true);
        if (accRes.ok) setAccount(await accRes.json());
        else {
          const e = await accRes.json();
          setError(e.error || "Account error");
        }
      }
      if (limRes.ok) setLimits(await limRes.json());
      if (autoRes.ok) setAuto(await autoRes.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="space-y-6 fade-up">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-3xl md:text-4xl text-[var(--brand)]">Desk overview</h1>
          <p className="mt-1 text-[var(--ink-soft)]">
            Account health, circuit breakers, and autopilot status.
          </p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {!configured && (
        <div className="panel p-6">
          <h2 className="display text-xl">Connect OANDA</h2>
          <p className="mt-2 text-[var(--ink-soft)]">
            Add your Practice token and account ID to start trading.
          </p>
          <Link href="/settings" className="btn btn-primary mt-4 inline-flex">
            Open settings
          </Link>
        </div>
      )}

      {error && (
        <p className="text-sm font-medium text-[var(--danger)]">{error}</p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="panel p-5">
          <div className="label">Balance</div>
          <div className="mono text-3xl font-semibold">
            {account?.balance ?? "—"}{" "}
            <span className="text-base text-[var(--ink-soft)]">
              {account?.currency || ""}
            </span>
          </div>
          <div className="mt-3 text-sm text-[var(--ink-soft)]">
            NAV {account?.NAV ?? "—"} · uPL {account?.unrealizedPL ?? "—"}
          </div>
        </div>
        <div className="panel p-5">
          <div className="label">Open trades</div>
          <div className="mono text-3xl font-semibold">
            {account?.openTradeCount ?? "—"}
          </div>
          <Link href="/positions" className="mt-3 inline-block text-sm font-semibold text-[var(--accent)]">
            View positions →
          </Link>
        </div>
        <div className="panel p-5">
          <div className="mb-2 flex items-center justify-between">
            <div className="label mb-0">Auto-trade</div>
            {auto?.enabled ? (
              <span className="badge badge-auto flex items-center gap-2">
                <span className="pulse-dot" /> On
              </span>
            ) : (
              <span className="badge">Off</span>
            )}
          </div>
          <div className="text-sm text-[var(--ink-soft)]">
            Status: {auto?.runtime?.lastStatus ?? "—"}
          </div>
          <div className="mt-1 text-xs text-[var(--ink-soft)]">
            Last run: {auto?.runtime?.lastRunAt
              ? new Date(auto.runtime.lastRunAt).toLocaleString()
              : "never"}
          </div>
          {auto?.runtime?.lastError && (
            <div className="mt-2 text-xs text-[var(--danger)]">
              {auto.runtime.lastError}
            </div>
          )}
        </div>
      </div>

      {limits && (
        <div className="panel p-5 md:p-6">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h2 className="display text-xl">Daily / weekly limits</h2>
            {limits.halted ? (
              <span className="badge badge-halt">Halted · {limits.reason}</span>
            ) : (
              <span className="badge badge-ok">Trading allowed</span>
            )}
          </div>
          {limits.message && (
            <p className="mb-4 text-sm font-medium text-[var(--halt)]">
              {limits.message}
            </p>
          )}
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <div className="mb-2 flex justify-between text-sm">
                <span>Today P/L</span>
                <span className="mono font-semibold">
                  {limits.dayPl.toFixed(2)}
                </span>
              </div>
              <div className="gauge">
                <span
                  style={{
                    width: `${gaugePct(limits.dayPl, limits.dailyMaxLoss, limits.dailyMaxWin)}%`,
                  }}
                />
              </div>
              <div className="mt-2 flex justify-between text-xs text-[var(--ink-soft)]">
                <span>Loss lim −{limits.dailyMaxLoss ?? "—"}</span>
                <span>Win lim +{limits.dailyMaxWin ?? "—"}</span>
              </div>
            </div>
            <div>
              <div className="mb-2 flex justify-between text-sm">
                <span>Week P/L</span>
                <span className="mono font-semibold">
                  {limits.weekPl.toFixed(2)}
                </span>
              </div>
              <div className="gauge">
                <span
                  style={{
                    width: `${gaugePct(limits.weekPl, limits.weeklyMaxLoss, limits.weeklyMaxWin)}%`,
                  }}
                />
              </div>
              <div className="mt-2 flex justify-between text-xs text-[var(--ink-soft)]">
                <span>Loss lim −{limits.weeklyMaxLoss ?? "—"}</span>
                <span>Win lim +{limits.weeklyMaxWin ?? "—"}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/trade" className="panel block p-6 transition hover:-translate-y-0.5">
          <h3 className="display text-xl">Manual AI trade</h3>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">
            Scan EMA/RSI/MACD/Bollinger strategies locally, or use Gemini.
          </p>
        </Link>
        <Link href="/history" className="panel block p-6 transition hover:-translate-y-0.5">
          <h3 className="display text-xl">Trade history</h3>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">
            Manual and auto fills, skips, and AI rationale.
          </p>
        </Link>
      </div>
    </div>
  );
}
