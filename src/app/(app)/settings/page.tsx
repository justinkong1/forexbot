"use client";

import { FormEvent, useEffect, useState } from "react";

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
};

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
      if (res.ok) setS(await res.json());
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
      const data = await res.json();
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
      if (refreshed.ok) setS(await refreshed.json());
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
          Broker credentials, risk, auto-trade, and daily/weekly limits.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
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

        <section className="panel space-y-4 p-5 md:p-6">
          <h2 className="display text-xl">Risk / size</h2>
          <div>
            <label className="label">Position sizing</label>
            <select
              className="select"
              value={s.sizingMode}
              onChange={(e) => setS({ ...s, sizingMode: e.target.value })}
            >
              <option value="full_balance">
                Full balance (100% margin → units for the pair)
              </option>
              <option value="risk_sl">
                Risk % of equity at stop-loss
              </option>
            </select>
            <p className="mt-1 text-xs text-[var(--ink-soft)]">
              Full balance uses your available margin and the pair&apos;s
              margin rate so one trade can deploy ~100% of the account.
              Keep max open trades at 1.
            </p>
          </div>
          {s.sizingMode === "full_balance" ? (
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
              Strategies use local EMA/RSI/MACD/Bollinger rules — no Gemini key needed.
            </p>
          </div>
          <div>
            <label className="label">Enabled strategies</label>
            <div className="space-y-2 text-sm">
              {[
                { id: "ema_cross", label: "EMA Cross + Trend" },
                { id: "rsi_reversion", label: "RSI Pullback" },
                { id: "macd_cross", label: "MACD Momentum" },
                { id: "bb_bounce", label: "Bollinger Bounce" },
              ].map((st) => {
                const enabled = s.enabledStrategies
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
                          s.enabledStrategies
                            .split(",")
                            .map((x) => x.trim())
                            .filter(Boolean),
                        );
                        if (e.target.checked) set.add(st.id);
                        else set.delete(st.id);
                        setS({
                          ...s,
                          enabledStrategies: Array.from(set).join(","),
                        });
                      }}
                    />
                    {st.label}
                  </label>
                );
              })}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="label">Min strategy votes</label>
              <input
                className="input mono"
                type="number"
                min={1}
                max={4}
                value={s.strategyMinVotes}
                onChange={(e) =>
                  setS({ ...s, strategyMinVotes: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <label className="label">ATR SL mult</label>
              <input
                className="input mono"
                type="number"
                step="0.1"
                value={s.atrSlMult}
                onChange={(e) =>
                  setS({ ...s, atrSlMult: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <label className="label">ATR TP mult</label>
              <input
                className="input mono"
                type="number"
                step="0.1"
                value={s.atrTpMult}
                onChange={(e) =>
                  setS({ ...s, atrTpMult: Number(e.target.value) })
                }
              />
            </div>
          </div>
          <div>
            <label className="label">Watchlist (comma-separated)</label>
            <input
              className="input mono"
              value={s.autoWatchlist}
              onChange={(e) => setS({ ...s, autoWatchlist: e.target.value })}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Timeframe</label>
              <select
                className="select"
                value={s.autoTimeframe}
                onChange={(e) => setS({ ...s, autoTimeframe: e.target.value })}
              >
                {["M5", "M15", "H1", "H4", "D"].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Scan interval (minutes)</label>
              <input
                className="input mono"
                type="number"
                min={5}
                value={s.autoIntervalMinutes}
                onChange={(e) =>
                  setS({ ...s, autoIntervalMinutes: Number(e.target.value) })
                }
              />
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

        {error && <p className="text-sm font-medium text-[var(--danger)]">{error}</p>}
        {msg && <p className="text-sm font-medium text-[var(--ok)]">{msg}</p>}

        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </button>
      </form>
    </div>
  );
}
