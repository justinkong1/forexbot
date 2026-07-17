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
  nav: number | null;
  peakEquity: number | null;
  drawdownPct: number | null;
  maxDrawdownPercent: number | null;
  lossStreak: number;
  lossStreakHalt: number | null;
  haltedUntil: string | null;
}

interface AutoStatus {
  enabled: boolean;
  runtime: { lastStatus: string; lastRunAt: string | null; lastError: string | null };
}

interface StrategyStat {
  strategyId: string;
  name: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  expectancy: number | null;
  totalPl: number;
  verdict: "profitable" | "losing" | "insufficient";
  autoDisabled: boolean;
}

function statVerdict(s: StrategyStat): { text: string; cls: string } {
  if (s.verdict === "profitable") {
    return { text: "Making money", cls: "badge-ok" };
  }
  if (s.verdict === "losing") {
    return {
      text: s.autoDisabled ? "Losing — auto-disabled" : "Losing money",
      cls: "badge-halt",
    };
  }
  return { text: "Not enough data yet", cls: "" };
}

function gaugePct(pl: number, maxLoss: number | null, maxWin: number | null) {
  const span = Math.max(Math.abs(maxLoss || 0), Math.abs(maxWin || 0), 1);
  return Math.min(100, Math.max(0, ((pl + span) / (2 * span)) * 100));
}

export default function DashboardPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [auto, setAuto] = useState<AutoStatus | null>(null);
  const [stats, setStats] = useState<StrategyStat[] | null>(null);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [discordMsg, setDiscordMsg] = useState<string | null>(null);
  const [sendingDiscord, setSendingDiscord] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [accRes, limRes, autoRes, setRes, statsRes] = await Promise.all([
        fetch("/api/oanda/account"),
        fetch("/api/limits/status"),
        fetch("/api/auto-trade"),
        fetch("/api/settings"),
        fetch("/api/stats"),
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
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data.strategies || []);
      }
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
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-accent"
            disabled={sendingDiscord || !configured}
            onClick={() => {
              void (async () => {
                setSendingDiscord(true);
                setDiscordMsg(null);
                setError(null);
                try {
                  const res = await fetch("/api/discord/status", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: "{}",
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error || "Failed");
                  setDiscordMsg(
                    `Sent ${data.instrument} to Discord (uPL ${Number(data.unrealizedPl).toFixed(2)})`,
                  );
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Discord send failed");
                } finally {
                  setSendingDiscord(false);
                }
              })();
            }}
          >
            {sendingDiscord ? "Sending…" : "Send trade status to Discord"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => void load()}>
            Refresh
          </button>
        </div>
      </div>

      {discordMsg && (
        <p className="text-sm font-medium text-[var(--ok)]">{discordMsg}</p>
      )}

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
            <h2 className="display text-xl">Guardrails</h2>
            {limits.halted ? (
              <span className="badge badge-halt">Halted · {limits.reason}</span>
            ) : (
              <span className="badge badge-ok">All protections OK</span>
            )}
          </div>
          {limits.message && (
            <p className="mb-4 text-sm font-medium text-[var(--halt)]">
              {limits.message}
            </p>
          )}
          <div className="grid gap-3 text-sm md:grid-cols-3">
            <div className="flex items-start gap-2">
              <span
                className={`badge ${
                  limits.reason === "drawdown" ? "badge-halt" : "badge-ok"
                }`}
              >
                {limits.reason === "drawdown" ? "TRIPPED" : "OK"}
              </span>
              <span>
                Drawdown protection
                <span className="block text-xs text-[var(--ink-soft)]">
                  {limits.drawdownPct != null
                    ? `${limits.drawdownPct.toFixed(1)}% below peak`
                    : "No equity data yet"}
                  {limits.maxDrawdownPercent != null &&
                    ` (halts at ${limits.maxDrawdownPercent}%)`}
                </span>
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span
                className={`badge ${
                  limits.reason === "loss_streak" ? "badge-halt" : "badge-ok"
                }`}
              >
                {limits.reason === "loss_streak" ? "TRIPPED" : "OK"}
              </span>
              <span>
                Loss streak
                <span className="block text-xs text-[var(--ink-soft)]">
                  {limits.lossStreak} in a row
                  {limits.lossStreakHalt != null &&
                    ` (halts at ${limits.lossStreakHalt})`}
                </span>
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span
                className={`badge ${
                  limits.reason === "cooldown" ? "badge-halt" : "badge-ok"
                }`}
              >
                {limits.reason === "cooldown" ? "COOLING" : "OK"}
              </span>
              <span>
                Cooldown
                <span className="block text-xs text-[var(--ink-soft)]">
                  {limits.halted && limits.haltedUntil
                    ? `Resumes ${new Date(limits.haltedUntil).toLocaleTimeString()}`
                    : "Not active"}
                </span>
              </span>
            </div>
          </div>
        </div>
      )}

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

      {stats && stats.length > 0 && (
        <div className="panel p-5 md:p-6">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h2 className="display text-xl">Strategy performance</h2>
            <span className="text-xs text-[var(--ink-soft)]">
              Last 30 closed trades per strategy
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-[var(--line)] text-xs uppercase tracking-wider text-[var(--ink-soft)]">
                <tr>
                  <th className="p-2">Strategy</th>
                  <th className="p-2">Trades</th>
                  <th className="p-2">W / L</th>
                  <th className="p-2">Win rate</th>
                  <th className="p-2">Avg / trade</th>
                  <th className="p-2">Total P/L</th>
                  <th className="p-2">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((st) => {
                  const v = statVerdict(st);
                  return (
                    <tr
                      key={st.strategyId}
                      className="border-b border-[var(--line)] last:border-0"
                    >
                      <td className="p-2 font-semibold">{st.name}</td>
                      <td className="p-2 mono">{st.trades}</td>
                      <td className="p-2 mono">
                        {st.wins} / {st.losses}
                      </td>
                      <td className="p-2 mono">
                        {st.winRate != null
                          ? `${(st.winRate * 100).toFixed(0)}%`
                          : "—"}
                      </td>
                      <td className="p-2 mono">
                        {st.expectancy != null
                          ? st.expectancy.toFixed(2)
                          : "—"}
                      </td>
                      <td
                        className={`p-2 mono font-semibold ${
                          st.totalPl > 0
                            ? "text-[var(--ok)]"
                            : st.totalPl < 0
                              ? "text-[var(--danger)]"
                              : ""
                        }`}
                      >
                        {st.totalPl > 0 ? "+" : ""}
                        {st.totalPl.toFixed(2)}
                      </td>
                      <td className="p-2">
                        <span className={`badge ${v.cls}`}>{v.text}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/trade" className="panel block p-6 transition hover:-translate-y-0.5">
          <h3 className="display text-xl">Trade desk</h3>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">
            Scan EMA/RSI/MACD/Bollinger strategies locally, or use Gemini.
          </p>
        </Link>
        <Link href="/backtest" className="panel block p-6 transition hover:-translate-y-0.5">
          <h3 className="display text-xl">Backtest</h3>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">
            Replay strategies on history before trusting them with money.
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
