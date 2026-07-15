import { loadCredentials } from "./credentials";
import { getLimitStatus } from "./limits";
import {
  analyzeInstrument,
  executeTrade,
  recordSkip,
} from "./execute";
import { getOpenTrades, getPositionForInstrument, type CandleGranularity } from "./oanda";
import { sendDiscord } from "./discord";
import { syncClosedTrades } from "./sync";

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;
let lastRunAt: string | null = null;
let lastError: string | null = null;
let lastStatus = "idle";

export function getAutoTradeRuntime() {
  return {
    workerActive: timer != null,
    cycleRunning: running,
    lastRunAt,
    lastError,
    lastStatus,
  };
}

async function runCycle() {
  if (running) return;
  running = true;
  lastStatus = "running";
  try {
    await syncClosedTrades();

    const { settings, oanda, discordWebhook } = await loadCredentials();
    if (!settings.autoTradeEnabled) {
      lastStatus = "disabled";
      return;
    }
    if (!oanda) {
      lastError = "Missing OANDA credentials";
      lastStatus = "error";
      return;
    }
    if (oanda.env === "live" && !settings.liveAutoAcknowledged) {
      lastError = "Live auto-trade not acknowledged";
      lastStatus = "error";
      return;
    }

    const limits = await getLimitStatus();
    if (limits.halted) {
      lastStatus = `halted:${limits.reason}`;
      await sendDiscord(
        discordWebhook,
        `Auto-trade halted: ${limits.message}`,
      );
      return;
    }

    const watchlist = settings.autoWatchlist
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const tf = settings.autoTimeframe as CandleGranularity;
    const openTrades = await getOpenTrades(oanda);

    for (const instrument of watchlist) {
      try {
        const limitsAgain = await getLimitStatus();
        if (limitsAgain.halted) {
          lastStatus = `halted:${limitsAgain.reason}`;
          break;
        }
        if (openTrades.length >= settings.maxOpenTrades) {
          await recordSkip({
            source: "auto",
            instrument,
            timeframe: tf,
            reason: "Max open trades reached",
          });
          continue;
        }

        const pos = await getPositionForInstrument(oanda, instrument);
        if (pos) {
          await recordSkip({
            source: "auto",
            instrument,
            timeframe: tf,
            reason: "Already in position",
          });
          continue;
        }

        const analysis = await analyzeInstrument({
          instrument,
          timeframe: tf,
        });
        const { signal } = analysis;

        if (signal.bias === "WAIT") {
          await recordSkip({
            source: "auto",
            instrument,
            timeframe: tf,
            signal,
            reason: "AI said WAIT",
          });
          continue;
        }

        if (signal.confidence < settings.autoMinConfidence) {
          await recordSkip({
            source: "auto",
            instrument,
            timeframe: tf,
            signal,
            reason: `Confidence ${signal.confidence.toFixed(2)} < ${settings.autoMinConfidence}`,
          });
          continue;
        }

        if (signal.takeProfit == null || signal.stopLoss == null) {
          await recordSkip({
            source: "auto",
            instrument,
            timeframe: tf,
            signal,
            reason: "Missing TP/SL",
          });
          continue;
        }

        await executeTrade({
          source: "auto",
          instrument,
          timeframe: tf,
          side: signal.bias,
          takeProfit: signal.takeProfit,
          stopLoss: signal.stopLoss,
          confidence: signal.confidence,
          rationale: signal.rationale,
          entryPrice: analysis.entry,
          units: analysis.suggestedUnits ?? undefined,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await recordSkip({
          source: "auto",
          instrument,
          timeframe: tf,
          reason: msg,
        });
      }
    }

    lastRunAt = new Date().toISOString();
    lastError = null;
    lastStatus = "ok";
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e);
    lastStatus = "error";
  } finally {
    running = false;
  }
}

export function startAutoTradeWorker() {
  if (timer) return;
  // Kick off soon, then interval from settings on each tick's scheduling is dynamic via restart
  void runCycle();
  timer = setInterval(() => {
    void (async () => {
      const { settings } = await loadCredentials();
      // Interval is fixed after start; restartAutoTradeWorker refreshes it
      if (!settings.autoTradeEnabled) {
        lastStatus = "disabled";
        return;
      }
      await runCycle();
    })();
  }, 60_000); // check every minute; runCycle no-ops when disabled; actual scan cadence gated below
}

let lastFullScan = 0;

export function startAutoTradeWorkerSmart() {
  if (timer) return;
  timer = setInterval(() => {
    void (async () => {
      try {
        const { settings } = await loadCredentials();
        if (!settings.autoTradeEnabled) {
          lastStatus = "disabled";
          return;
        }
        const intervalMs = Math.max(1, settings.autoIntervalMinutes) * 60_000;
        const now = Date.now();
        if (now - lastFullScan < intervalMs && lastFullScan !== 0) {
          return;
        }
        lastFullScan = now;
        await runCycle();
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }
    })();
  }, 30_000);
  // immediate first check after short delay
  setTimeout(() => {
    lastFullScan = 0;
    void runCycle().then(() => {
      lastFullScan = Date.now();
    });
  }, 5_000);
}

export function stopAutoTradeWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export async function triggerAutoTradeNow() {
  lastFullScan = Date.now();
  await runCycle();
  return getAutoTradeRuntime();
}

// Auto-start in Node server runtime (not during edge/build)
declare global {
  var __autoTradeStarted: boolean | undefined;
}

export function ensureAutoTradeWorker() {
  if (typeof window !== "undefined") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (globalThis.__autoTradeStarted) return;
  globalThis.__autoTradeStarted = true;
  startAutoTradeWorkerSmart();
}
