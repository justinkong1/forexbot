import { loadCredentials } from "./credentials";
import { getLimitStatus } from "./limits";
import {
  analyzeInstrument,
  analyzeStrategies,
  executeTrade,
  recordSkip,
} from "./execute";
import { getOpenTrades, getPositionForInstrument, type CandleGranularity } from "./oanda";
import { notifyHalt } from "./discord";
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
      await notifyHalt(
        discordWebhook,
        limits.message || "Circuit breaker active",
      );
      return;
    }

    const mode = settings.autoMode || "strategy";
    const watchlist = settings.autoWatchlist
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const tf = settings.autoTimeframe as CandleGranularity;
    let openTrades = await getOpenTrades(oanda);

    for (const instrument of watchlist) {
      try {
        const limitsAgain = await getLimitStatus();
        if (limitsAgain.halted) {
          lastStatus = `halted:${limitsAgain.reason}`;
          break;
        }
        if (openTrades.length >= settings.maxOpenTrades) {
          await recordSkip({
            source: mode === "ai" ? "auto" : "strategy",
            instrument,
            timeframe: tf,
            reason: "Max open trades reached",
          });
          continue;
        }

        const pos = await getPositionForInstrument(oanda, instrument);
        if (pos) {
          await recordSkip({
            source: mode === "ai" ? "auto" : "strategy",
            instrument,
            timeframe: tf,
            reason: "Already in position",
          });
          continue;
        }

        if (mode === "strategy" || mode === "both") {
          const scan = await analyzeStrategies({ instrument, timeframe: tf });
          if (!scan.consensus) {
            await recordSkip({
              source: "strategy",
              instrument,
              timeframe: tf,
              reason: `No strategy consensus (BUY votes ${scan.buyVotes}, SELL ${scan.sellVotes})`,
            });
          } else if (scan.consensus.confidence < settings.autoMinConfidence) {
            await recordSkip({
              source: "strategy",
              instrument,
              timeframe: tf,
              signal: scan.consensus,
              reason: `Strategy confidence ${scan.consensus.confidence.toFixed(2)} < ${settings.autoMinConfidence}`,
            });
          } else if (
            scan.consensus.takeProfit == null ||
            scan.consensus.stopLoss == null
          ) {
            await recordSkip({
              source: "strategy",
              instrument,
              timeframe: tf,
              signal: scan.consensus,
              reason: "Missing TP/SL from strategies",
            });
          } else {
            if (
              scan.consensus.bias !== "BUY" &&
              scan.consensus.bias !== "SELL"
            ) {
              continue;
            }
            await executeTrade({
              source: "strategy",
              instrument,
              timeframe: tf,
              side: scan.consensus.bias,
              takeProfit: scan.consensus.takeProfit,
              stopLoss: scan.consensus.stopLoss,
              confidence: scan.consensus.confidence,
              rationale: scan.consensus.rationale,
              entryPrice: scan.consensus.entry,
              units: scan.suggestedUnits ?? undefined,
            });
            openTrades = await getOpenTrades(oanda);
            // If mode is both, still skip AI for this pair once filled
            continue;
          }
          if (mode === "strategy") continue;
        }

        if (mode === "ai" || mode === "both") {
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
              reason: `AI confidence ${signal.confidence.toFixed(2)} < ${settings.autoMinConfidence}`,
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
          openTrades = await getOpenTrades(oanda);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await recordSkip({
          source: mode === "ai" ? "auto" : "strategy",
          instrument,
          timeframe: tf,
          reason: msg,
        });
      }
    }

    lastRunAt = new Date().toISOString();
    lastError = null;
    lastStatus = `ok:${mode}`;
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e);
    lastStatus = "error";
  } finally {
    running = false;
  }
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
