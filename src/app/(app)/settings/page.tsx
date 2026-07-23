"use client";

import { FormEvent, useEffect, useState } from "react";
import { readJson } from "@/lib/http";

interface SettingsState {
  oandaAccountId: string;
  oandaEnv: string;
  oandaTokenMasked: string;
  geminiMasked: string;
  discordMasked: string;
  hasOandaToken: boolean;
  hasGeminiKey: boolean;
  geminiModel: string;
  hasDiscord: boolean;
  riskPercent: number;
  maxUnits: number;
  minRiskReward: number;
  sizingMode: string;
  balanceUtilization: number;
  autoTradeEnabled: boolean;
  autoWatchlist: string;
  autoTimeframe: string;
  autoIntervalMinutes: number;
  autoMinConfidence: number;
  maxOpenTrades: number;
  autoMode: string;
  enabledStrategies: string;
  strategyMinVotes: number;
  atrSlMult: number;
  atrTpMult: number;
  liveAcknowledged: boolean;
  liveAutoAcknowledged: boolean;
  dailyMaxLoss: number | null;
  dailyMaxWin: number | null;
  weeklyMaxLoss: number | null;
  weeklyMaxWin: number | null;
  riskProfile: string;
  maxDrawdownPercent: number | null;
  lossStreakHalt: number | null;
  haltCooldownMinutes: number;
  sessionFilterEnabled: boolean;
  htfTrendFilterEnabled: boolean;
  autoDisableStrategies: boolean;
  peakEquity: number | null;
  fullBalanceLiveAcknowledged: boolean;
  dayEnabled: boolean;
  dayWatchlist: string;
  dayTimeframe: string;
  dayIntervalMinutes: number;
  dayStrategies: string;
  dayAtrSlMult: number;
  dayAtrTpMult: number;
  dayMaxOpenTrades: number;
  swingEnabled: boolean;
  swingWatchlist: string;
  swingTimeframe: string;
  swingIntervalMinutes: number;
  swingStrategies: string;
  swingAtrSlMult: number;
  swingAtrTpMult: number;
  swingMaxOpenTrades: number;
}

interface LaneValues {
  enabled: boolean;
  watchlist: string;
  timeframe: string;
  intervalMinutes: number;
  strategies: string;
  maxOpenTrades: number;
}

const STRATEGY_OPTIONS: Array<{
  id: string;
  label: string;
  styles: Array<"day" | "swing">;
}> = [
  { id: "ema_cross", label: "EMA Cross + Trend", styles: ["day", "swing"] },
  { id: "rsi_reversion", label: "RSI Pullback", styles: ["day"] },
  { id: "macd_cross", label: "MACD Momentum", styles: ["day", "swing"] },
  { id: "bb_bounce", label: "Bollinger Bounce", styles: ["day"] },
  { id: "donchian_break", label: "Donchian Breakout", styles: ["swing"] },
  { id: "htf_pullback", label: "Trend Pullback", styles: ["swing"] },
];

function LaneCard(props: {
  style: "day" | "swing";
  title: string;
  blurb: string;
  timeframes: string[];
  minInterval: number;
  values: LaneValues;
  onChange: (patch: Partial<LaneValues>) => void;
}) {
  const { values, onChange } = props;
  const options = STRATEGY_OPTIONS.filter((o) =>
    o.styles.includes(props.style),
  );
  return (
    <div
      className={`panel space-y-4 p-4 md:p-5 ${values.enabled ? "" : "opacity-70"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="display text-lg">{props.title}</h3>
          <p className="text-xs text-[var(--ink-soft)]">{props.blurb}</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={values.enabled}
            onChange={(e) => onChange({ enabled: e.target.checked })}
          />
          Enabled
        </label>
      </div>
      <div>
        <label className="label">Watchlist (comma-separated)</label>
        <input
          className="input mono"
          value={values.watchlist}
          onChange={(e) => onChange({ watchlist: e.target.value })}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="label">Timeframe</label>
          <select
            className="select"
            value={values.timeframe}
            onChange={(e) => onChange({ timeframe: e.target.value })}
          >
            {props.timeframes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Scan every (min)</label>
          <input
            className="input mono"
            type="number"
            min={props.minInterval}
            value={values.intervalMinutes}
            onChange={(e) =>
              onChange({ intervalMinutes: Number(e.target.value) })
            }
          />
        </div>
        <div>
          <label className="label">Max open trades</label>
          <input
            className="input mono"
            type="number"
            min={1}
            max={10}
            value={values.maxOpenTrades}
            onChange={(e) =>
              onChange({ maxOpenTrades: Number(e.target.value) })
            }
          />
        </div>
      </div>
      <div className="rounded-md border border-[var(--line)] bg-[var(--panel-solid)] px-3 py-2 text-xs text-[var(--ink-soft)]">
        Exits are chosen by the strategy from market structure. Your risk % and
        min R:R still control size and quality.
      </div>
      <div>
        <label className="label">Strategies</label>
        <div className="space-y-2 text-sm">
          {options.map((st) => {
            const enabled = values.strategies
              .split(",")
              .map((x) => x.trim())
              .includes(st.id);
            return (
              <label key={st.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => {
                    const set = new Set(
                      values.strategies
                        .split(",")
                        .map((x) => x.trim())
                        .filter(Boolean),
                    );
                    if (e.target.checked) set.add(st.id);
                    else set.delete(st.id);
                    onChange({ strategies: Array.from(set).join(",") });
                  }}
                />
                {st.label}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const empty: SettingsState = {
  oandaAccountId: "",
  oandaEnv: "practice",
  oandaTokenMasked: "",
  geminiMasked: "",
  discordMasked: "",
  hasOandaToken: false,
  hasGeminiKey: false,
  geminiModel: "gemini-2.5-flash",
  hasDiscord: false,
  riskPercent: 1,
  maxUnits: 10000,
  minRiskReward: 1,
  sizingMode: "full_balance",
  balanceUtilization: 100,
  autoTradeEnabled: false,
  autoWatchlist: "EUR_USD,USD_JPY,GBP_USD",
  autoTimeframe: "H1",
  autoIntervalMinutes: 60,
  autoMinConfidence: 0.7,
  maxOpenTrades: 1,
  autoMode: "strategy",
  enabledStrategies: "ema_cross,rsi_reversion,macd_cross,bb_bounce",
  strategyMinVotes: 1,
  atrSlMult: 1.5,
  atrTpMult: 2.5,
  liveAcknowledged: false,
  liveAutoAcknowledged: false,
  dailyMaxLoss: null,
  dailyMaxWin: null,
  weeklyMaxLoss: null,
  weeklyMaxWin: null,
  riskProfile: "safe",
  maxDrawdownPercent: 10,
  lossStreakHalt: 4,
  haltCooldownMinutes: 60,
  sessionFilterEnabled: true,
  htfTrendFilterEnabled: true,
  autoDisableStrategies: true,
  peakEquity: null,
  fullBalanceLiveAcknowledged: false,
  dayEnabled: true,
  dayWatchlist: "EUR_USD,USD_JPY,GBP_USD",
  dayTimeframe: "M15",
  dayIntervalMinutes: 15,
  dayStrategies: "ema_cross,rsi_reversion,macd_cross,bb_bounce",
  dayAtrSlMult: 1.5,
  dayAtrTpMult: 2.5,
  dayMaxOpenTrades: 2,
  swingEnabled: false,
  swingWatchlist: "EUR_USD,GBP_USD,AUD_USD",
  swingTimeframe: "H4",
  swingIntervalMinutes: 240,
  swingStrategies: "donchian_break,htf_pullback,ema_cross,macd_cross",
  swingAtrSlMult: 2.5,
  swingAtrTpMult: 5,
  swingMaxOpenTrades: 1,
};

const PROFILE_CARDS = [
  {
    id: "safe",
    label: "Safe",
    blurb:
      "Risks 1% per trade, needs 2 strategies to agree, only trades London/NY hours, stops after 4 losses in a row or a 10% drawdown.",
  },
  {
    id: "balanced",
    label: "Balanced",
    blurb:
      "Risks 2% per trade with the same smart filters. Pauses at a 15% drawdown or 5 losses in a row.",
  },
  {
    id: "custom",
    label: "Custom",
    blurb:
      "You control every knob, including full-balance sizing. Only pick this if you know what you're doing.",
  },
] as const;

export default function SettingsPage() {
  const [s, setS] = useState<SettingsState>(empty);
  const [oandaToken, setOandaToken] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [discordWebhook, setDiscordWebhook] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/settings");
      if (res.ok) setS(await readJson<SettingsState>(res));
    })();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...s,
          oandaToken: oandaToken || undefined,
          geminiKey: geminiKey || undefined,
          discordWebhook: discordWebhook || undefined,
        }),
      });
      const data = await readJson<{
        account?: { balance?: string; currency?: string };
      }>(res);
      if (!res.ok) throw new Error(data.error || "Save failed");
      setMsg(
        data.account
          ? `Saved. Balance ${data.account.balance} ${data.account.currency}`
          : "Saved.",
      );
      setOandaToken("");
      setGeminiKey("");
      setDiscordWebhook("");
      const refreshed = await fetch("/api/settings");
      if (refreshed.ok) setS(await readJson<SettingsState>(refreshed));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function numOrEmpty(v: number | null) {
    return v == null ? "" : String(v);
  }

  return (
    <div className="fade-up mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="display text-3xl text-[var(--brand)]">Settings</h1>
        <p className="mt-1 text-[var(--ink-soft)]">
          Pick a risk profile, connect your broker, and let the guardrails do
          the worrying.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <section className="panel space-y-4 p-5 md:p-6">
          <h2 className="display text-xl">Risk profile</h2>
          <p className="text-sm text-[var(--ink-soft)]">
            Pick how carefully the bot should trade. You can change this any
            time — Safe is strongly recommended while you learn.
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            {PROFILE_CARDS.map((p) => {
              const active = s.riskProfile === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setS({ ...s, riskProfile: p.id })}
                  className={`panel space-y-2 p-4 text-left transition ${
                    active
                      ? "outline outline-2 outline-[var(--brand)]"
                      : "opacity-75 hover:opacity-100"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="display text-lg">{p.label}</span>
                    {active && <span className="badge badge-ok">Selected</span>}
                  </div>
                  <p className="text-xs leading-relaxed text-[var(--ink-soft)]">
                    {p.blurb}
                  </p>
                </button>
              );
            })}
          </div>
          {s.riskProfile !== "custom" && (
            <p className="text-xs text-[var(--ink-soft)]">
              This profile locks in its sizing, filters, and kill switches when
              you save. Switch to Custom to edit them yourself.
            </p>
          )}
        </section>

        <section className="panel space-y-4 p-5 md:p-6">
          <h2 className="display text-xl">OANDA</h2>
          <div>
            <label className="label">Environment</label>
            <select
              className="select"
              value={s.oandaEnv}
              onChange={(e) => setS({ ...s, oandaEnv: e.target.value })}
            >
              <option value="practice">Practice (demo)</option>
              <option value="live">Live</option>
            </select>
          </div>
          {s.oandaEnv === "live" && (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={s.liveAcknowledged}
                onChange={(e) =>
                  setS({ ...s, liveAcknowledged: e.target.checked })
                }
              />
              <span>
                I understand Live uses real funds and acknowledge the risk.
              </span>
            </label>
          )}
          <div>
            <label className="label">
              API token{" "}
              {s.hasOandaToken && (
                <span className="normal-case tracking-normal text-[var(--ink-soft)]">
                  (saved: {s.oandaTokenMasked})
                </span>
              )}
            </label>
            <input
              className="input mono"
              type="password"
              placeholder={s.hasOandaToken ? "Leave blank to keep" : "Personal access token"}
              value={oandaToken}
              onChange={(e) => setOandaToken(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Account ID</label>
            <input
              className="input mono"
              value={s.oandaAccountId}
              onChange={(e) => setS({ ...s, oandaAccountId: e.target.value })}
              required
            />
          </div>
        </section>

        <section className="panel space-y-4 p-5 md:p-6">
          <h2 className="display text-xl">Gemini AI</h2>
          <div>
            <label className="label">Model</label>
            <select
              className="select"
              value={
                ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"].includes(
                  s.geminiModel,
                )
                  ? s.geminiModel
                  : "gemini-2.5-flash"
              }
              onChange={(e) => setS({ ...s, geminiModel: e.target.value })}
            >
              <option value="gemini-2.5-flash">2.5 Flash (recommended)</option>
              <option value="gemini-2.5-flash-lite">
                2.5 Flash-Lite (higher free quota)
              </option>
              <option value="gemini-2.5-pro">2.5 Pro</option>
            </select>
            <p className="mt-1 text-xs text-[var(--ink-soft)]">
              Older 1.5 / 2.0 model IDs are retired — use a 2.5 model.
            </p>
          </div>
          <div>
            <label className="label">
              API key{" "}
              {s.hasGeminiKey && (
                <span className="normal-case tracking-normal text-[var(--ink-soft)]">
                  (saved: {s.geminiMasked})
                </span>
              )}
            </label>
            <input
              className="input mono"
              type="password"
              placeholder={s.hasGeminiKey ? "Leave blank to keep" : "Gemini API key"}
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
            />
          </div>
          <div>
            <label className="label">
              Discord webhook (optional){" "}
              {s.hasDiscord && (
                <span className="normal-case tracking-normal text-[var(--ink-soft)]">
                  (saved: {s.discordMasked})
                </span>
              )}
            </label>
            <input
              className="input mono"
              type="password"
              placeholder="https://discord.com/api/webhooks/…"
              value={discordWebhook}
              onChange={(e) => setDiscordWebhook(e.target.value)}
            />
          </div>
        </section>

        {s.riskProfile === "custom" && (
          <section className="panel space-y-4 p-5 md:p-6">
            <h2 className="display text-xl">Risk / size (advanced)</h2>
            <div>
              <label className="label">Position sizing</label>
              <select
                className="select"
                value={s.sizingMode}
                onChange={(e) => setS({ ...s, sizingMode: e.target.value })}
              >
                <option value="risk_sl">
                  Risk % of equity at stop-loss (recommended)
                </option>
                <option value="full_balance">
                  Full balance (100% margin → units for the pair)
                </option>
              </select>
              <p className="mt-1 text-xs text-[var(--ink-soft)]">
                Risk % keeps each loss small and survivable. Full balance
                deploys nearly all margin on one trade.
              </p>
            </div>
            {s.sizingMode === "full_balance" ? (
              <>
                <div className="border-l-4 border-l-[var(--danger)] bg-[rgba(184,58,58,0.08)] p-3 text-sm">
                  <strong>Warning:</strong> full-balance sizing means one losing
                  trade can wipe out most of your account. There is no way to
                  make this safe.
                </div>
                <div>
                  <label className="label">Balance utilization %</label>
                  <input
                    className="input mono"
                    type="number"
                    step="1"
                    min="1"
                    max="100"
                    value={s.balanceUtilization}
                    onChange={(e) =>
                      setS({ ...s, balanceUtilization: Number(e.target.value) })
                    }
                  />
                </div>
                {s.oandaEnv === "live" && (
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={s.fullBalanceLiveAcknowledged}
                      onChange={(e) =>
                        setS({
                          ...s,
                          fullBalanceLiveAcknowledged: e.target.checked,
                        })
                      }
                    />
                    <span>
                      I understand full-balance sizing on Live can lose my whole
                      account on a single trade.
                    </span>
                  </label>
                )}
              </>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="label">Risk % / trade (at SL)</label>
                  <input
                    className="input mono"
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="100"
                    value={s.riskPercent}
                    onChange={(e) =>
                      setS({ ...s, riskPercent: Number(e.target.value) })
                    }
                  />
                  <p className="mt-1 text-xs text-[var(--ink-soft)]">
                    How much of your account one losing trade costs. 1% = 100
                    losses to zero; pros stay at 0.5–2%.
                  </p>
                </div>
                <div>
                  <label className="label">Max units cap</label>
                  <input
                    className="input mono"
                    type="number"
                    value={s.maxUnits}
                    onChange={(e) =>
                      setS({ ...s, maxUnits: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="label">Min R:R</label>
                <input
                  className="input mono"
                  type="number"
                  step="0.1"
                  value={s.minRiskReward}
                  onChange={(e) =>
                    setS({ ...s, minRiskReward: Number(e.target.value) })
                  }
                />
                <p className="mt-1 text-xs text-[var(--ink-soft)]">
                  Rejects trades whose target is small compared to the risk.
                </p>
              </div>
              <div>
                <label className="label">Max open trades</label>
                <input
                  className="input mono"
                  type="number"
                  min={1}
                  value={s.maxOpenTrades}
                  onChange={(e) =>
                    setS({ ...s, maxOpenTrades: Number(e.target.value) })
                  }
                />
              </div>
            </div>
          </section>
        )}

        <section className="panel space-y-4 p-5 md:p-6">
          <h2 className="display text-xl">Protection (kill switches)</h2>
          <p className="text-sm text-[var(--ink-soft)]">
            These stop all trading automatically when things go wrong, so one
            bad day can&apos;t snowball.
            {s.riskProfile !== "custom" &&
              " Your risk profile manages the values below."}
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="label">Max drawdown %</label>
              <input
                className="input mono"
                type="number"
                step="1"
                min="1"
                max="90"
                disabled={s.riskProfile !== "custom"}
                value={numOrEmpty(s.maxDrawdownPercent)}
                onChange={(e) =>
                  setS({
                    ...s,
                    maxDrawdownPercent:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
              <p className="mt-1 text-xs text-[var(--ink-soft)]">
                Halts when the account falls this far below its best value.
              </p>
            </div>
            <div>
              <label className="label">Losses in a row</label>
              <input
                className="input mono"
                type="number"
                min="2"
                max="20"
                disabled={s.riskProfile !== "custom"}
                value={numOrEmpty(s.lossStreakHalt)}
                onChange={(e) =>
                  setS({
                    ...s,
                    lossStreakHalt:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
              <p className="mt-1 text-xs text-[var(--ink-soft)]">
                Forces a break after this many consecutive losing trades.
              </p>
            </div>
            <div>
              <label className="label">Cooldown (minutes)</label>
              <input
                className="input mono"
                type="number"
                min="0"
                disabled={s.riskProfile !== "custom"}
                value={s.haltCooldownMinutes}
                onChange={(e) =>
                  setS({
                    ...s,
                    haltCooldownMinutes: Number(e.target.value),
                  })
                }
              />
              <p className="mt-1 text-xs text-[var(--ink-soft)]">
                How long trading stays paused after any halt trips.
              </p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                disabled={s.riskProfile !== "custom"}
                checked={s.sessionFilterEnabled}
                onChange={(e) =>
                  setS({ ...s, sessionFilterEnabled: e.target.checked })
                }
              />
              <span>
                Only trade London/NY hours
                <span className="block text-xs text-[var(--ink-soft)]">
                  Skips thin, spready markets overnight and on weekends.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                disabled={s.riskProfile !== "custom"}
                checked={s.htfTrendFilterEnabled}
                onChange={(e) =>
                  setS({ ...s, htfTrendFilterEnabled: e.target.checked })
                }
              />
              <span>
                Follow the bigger trend
                <span className="block text-xs text-[var(--ink-soft)]">
                  Blocks trades that fight the higher-timeframe direction.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                disabled={s.riskProfile !== "custom"}
                checked={s.autoDisableStrategies}
                onChange={(e) =>
                  setS({ ...s, autoDisableStrategies: e.target.checked })
                }
              />
              <span>
                Bench losing strategies
                <span className="block text-xs text-[var(--ink-soft)]">
                  Auto-disables any strategy that&apos;s losing money over its
                  recent trades.
                </span>
              </span>
            </label>
          </div>
          {s.peakEquity != null && (
            <div className="flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-3 text-sm">
              <span className="text-[var(--ink-soft)]">
                Drawdown is measured from your peak equity of{" "}
                <span className="mono font-semibold">
                  {s.peakEquity.toFixed(2)}
                </span>
                .
              </span>
              <button
                type="button"
                className="btn btn-ghost text-xs"
                onClick={() => {
                  void (async () => {
                    const res = await fetch("/api/settings", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ resetPeakEquity: true }),
                    });
                    if (res.ok) {
                      const refreshed = await fetch("/api/settings");
                      if (refreshed.ok) setS(await readJson<SettingsState>(refreshed));
                      setMsg("Peak equity reset — drawdown now measures from current equity.");
                    }
                  })();
                }}
              >
                Reset peak to current equity
              </button>
            </div>
          )}
        </section>

        <section className="panel space-y-4 p-5 md:p-6">
          <h2 className="display text-xl">Daily / weekly limits</h2>
          <p className="text-sm text-[var(--ink-soft)]">
            Leave blank to disable a limit. Values are in account currency.
            Hitting a limit blocks both manual and auto entries (UTC day/week).
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Daily max loss</label>
              <input
                className="input mono"
                type="number"
                placeholder="e.g. 100"
                value={numOrEmpty(s.dailyMaxLoss)}
                onChange={(e) =>
                  setS({
                    ...s,
                    dailyMaxLoss:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </div>
            <div>
              <label className="label">Daily max win</label>
              <input
                className="input mono"
                type="number"
                placeholder="e.g. 200"
                value={numOrEmpty(s.dailyMaxWin)}
                onChange={(e) =>
                  setS({
                    ...s,
                    dailyMaxWin:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </div>
            <div>
              <label className="label">Weekly max loss</label>
              <input
                className="input mono"
                type="number"
                value={numOrEmpty(s.weeklyMaxLoss)}
                onChange={(e) =>
                  setS({
                    ...s,
                    weeklyMaxLoss:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </div>
            <div>
              <label className="label">Weekly max win</label>
              <input
                className="input mono"
                type="number"
                value={numOrEmpty(s.weeklyMaxWin)}
                onChange={(e) =>
                  setS({
                    ...s,
                    weeklyMaxWin:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </div>
          </div>
        </section>

        <section className="panel space-y-4 p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="display text-xl">Auto-trade</h2>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={s.autoTradeEnabled}
                onChange={(e) =>
                  setS({ ...s, autoTradeEnabled: e.target.checked })
                }
              />
              Enabled
            </label>
          </div>
          {s.oandaEnv === "live" && s.autoTradeEnabled && (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={s.liveAutoAcknowledged}
                onChange={(e) =>
                  setS({ ...s, liveAutoAcknowledged: e.target.checked })
                }
              />
              <span>
                I acknowledge enabling auto-trade on a Live account.
              </span>
            </label>
          )}
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="label">Detection mode</label>
              <select
                className="select"
                value={s.autoMode}
                onChange={(e) => setS({ ...s, autoMode: e.target.value })}
              >
                <option value="strategy">Strategies only (no AI)</option>
                <option value="ai">Gemini AI only</option>
                <option value="both">Strategies first, then AI fallback</option>
              </select>
              <p className="mt-1 text-xs text-[var(--ink-soft)]">
                Strategies use local indicator rules — no Gemini key needed.
              </p>
            </div>
            <div>
              <label className="label">Min strategy votes</label>
              <input
                className="input mono"
                type="number"
                min={1}
                max={4}
                disabled={s.riskProfile !== "custom"}
                value={s.strategyMinVotes}
                onChange={(e) =>
                  setS({ ...s, strategyMinVotes: Number(e.target.value) })
                }
              />
              <p className="mt-1 text-xs text-[var(--ink-soft)]">
                How many strategies must agree before entering.
              </p>
            </div>
            <div>
              <label className="label">Min confidence</label>
              <input
                className="input mono"
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={s.autoMinConfidence}
                onChange={(e) =>
                  setS({ ...s, autoMinConfidence: Number(e.target.value) })
                }
              />
            </div>
          </div>
        </section>

        <section className="panel space-y-4 p-5 md:p-6">
          <h2 className="display text-xl">Trading styles</h2>
          <p className="text-sm text-[var(--ink-soft)]">
            Day trading takes multiple quick trades during the session; swing
            trading holds fewer positions for days to weeks. Run either or
            both — each lane has its own watchlist, pace, and strategies.
            Kill switches, risk sizing, and the correlation guard stay shared.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            <LaneCard
              style="day"
              title="Day trading"
              blurb="Fast timeframes with structure-based exits — trades usually resolve within hours."
              timeframes={["M5", "M15", "M30", "H1"]}
              minInterval={5}
              values={{
                enabled: s.dayEnabled,
                watchlist: s.dayWatchlist,
                timeframe: s.dayTimeframe,
                intervalMinutes: s.dayIntervalMinutes,
                strategies: s.dayStrategies,
                maxOpenTrades: s.dayMaxOpenTrades,
              }}
              onChange={(patch) =>
                setS((prev) => ({
                  ...prev,
                  ...(patch.enabled != null && { dayEnabled: patch.enabled }),
                  ...(patch.watchlist != null && {
                    dayWatchlist: patch.watchlist,
                  }),
                  ...(patch.timeframe != null && {
                    dayTimeframe: patch.timeframe,
                  }),
                  ...(patch.intervalMinutes != null && {
                    dayIntervalMinutes: patch.intervalMinutes,
                  }),
                  ...(patch.strategies != null && {
                    dayStrategies: patch.strategies,
                  }),
                  ...(patch.maxOpenTrades != null && {
                    dayMaxOpenTrades: patch.maxOpenTrades,
                  }),
                }))
              }
            />
            <LaneCard
              style="swing"
              title="Swing trading"
              blurb="H4/Daily entries with structure-based exits — positions ride for days to weeks."
              timeframes={["H1", "H4", "D"]}
              minInterval={30}
              values={{
                enabled: s.swingEnabled,
                watchlist: s.swingWatchlist,
                timeframe: s.swingTimeframe,
                intervalMinutes: s.swingIntervalMinutes,
                strategies: s.swingStrategies,
                maxOpenTrades: s.swingMaxOpenTrades,
              }}
              onChange={(patch) =>
                setS((prev) => ({
                  ...prev,
                  ...(patch.enabled != null && { swingEnabled: patch.enabled }),
                  ...(patch.watchlist != null && {
                    swingWatchlist: patch.watchlist,
                  }),
                  ...(patch.timeframe != null && {
                    swingTimeframe: patch.timeframe,
                  }),
                  ...(patch.intervalMinutes != null && {
                    swingIntervalMinutes: patch.intervalMinutes,
                  }),
                  ...(patch.strategies != null && {
                    swingStrategies: patch.strategies,
                  }),
                  ...(patch.maxOpenTrades != null && {
                    swingMaxOpenTrades: patch.maxOpenTrades,
                  }),
                }))
              }
            />
          </div>
          <p className="text-xs text-[var(--ink-soft)]">
            The session filter (London/NY hours) applies to day trades only —
            swing entries can trigger whenever their setup appears. Swing
            trades are exempt because exits happen days later anyway.
          </p>
        </section>

        {error && <p className="text-sm font-medium text-[var(--danger)]">{error}</p>}
        {msg && <p className="text-sm font-medium text-[var(--ok)]">{msg}</p>}

        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </button>
      </form>
    </div>
  );
}
