import { loadCredentials } from "./credentials";
import { getLimitStatus } from "./limits";
import {
  analyzeInstrument,
  analyzeStrategies,
  effectiveMaxOpenTrades,
  executeTrade,
  laneConfig,
  recordSkip,
} from "./execute";
import { getOpenTrades, getPositionForInstrument } from "./oanda";
import { prisma } from "./db";
import { syncClosedTrades } from "./sync";
import { getDisabledStrategyIds } from "./stats";
import { runEntryFilters } from "./filters";
import type { TradeStyle } from "./strategies";

interface LaneRuntime {
  lastRunAt: string | null;
  lastStatus: string;
  lastError: string | null;
}

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;
let lastRunAt: string | null = null;
let lastError: string | null = null;
let lastStatus = "idle";

const laneRuntime: Record<TradeStyle, LaneRuntime> = {
  day: { lastRunAt: null, lastStatus: "idle", lastError: null },
  swing: { lastRunAt: null, lastStatus: "idle", lastError: null },
};

export function getAutoTradeRuntime() {
  return {
    workerActive: timer != null,
    cycleRunning: running,
    lastRunAt,
    lastError,
    lastStatus,
    lanes: {
      day: { ...laneRuntime.day },
      swing: { ...laneRuntime.swing },
    },
  };
}

async function countOpenLaneTrades(style: TradeStyle): Promise<number> {
  return prisma.tradeJournal.count({
    where: { outcome: "open", style },
  });
}

async function runLane(style: TradeStyle) {
  const rt = laneRuntime[style];
  rt.lastStatus = "running";
  try {
    const { settings, oanda } = await loadCredentials();
    if (!settings.autoTradeEnabled) {
      rt.lastStatus = "disabled";
      return;
    }
    const lane = laneConfig(settings, style);
    if (!lane.enabled) {
      rt.lastStatus = "lane off";
      return;
    }
    if (!oanda) {
      rt.lastError = "Missing OANDA credentials";
      rt.lastStatus = "error";
      return;
    }
    if (oanda.env === "live" && !settings.liveAutoAcknowledged) {
      rt.lastError = "Live auto-trade not acknowledged";
      rt.lastStatus = "error";
      return;
    }

    const limits = await getLimitStatus();
    if (limits.halted) {
      // limits.ts sends the Discord halt notification (deduped)
      rt.lastStatus = `halted:${limits.reason}`;
      return;
    }

    const mode = settings.autoMode || "strategy";
    const globalCap = effectiveMaxOpenTrades(settings);
    let openTrades = await getOpenTrades(oanda);
    let laneOpen = await countOpenLaneTrades(style);

    // Auto-disable strategies with proven negative expectancy (per lane)
    const disabledIds = settings.autoDisableStrategies
      ? await getDisabledStrategyIds(style)
      : [];

    for (const instrument of lane.watchlist) {
      try {
        const limitsAgain = await getLimitStatus();
        if (limitsAgain.halted) {
          rt.lastStatus = `halted:${limitsAgain.reason}`;
          break;
        }
        if (openTrades.length >= globalCap) {
          await recordSkip({
            source: mode === "ai" ? "auto" : "strategy",
            instrument,
            timeframe: lane.timeframe,
            reason: `Max open trades reached (${globalCap} total)`,
            style,
          });
          continue;
        }
        if (laneOpen >= lane.maxOpenTrades) {
          await recordSkip({
            source: mode === "ai" ? "auto" : "strategy",
            instrument,
            timeframe: lane.timeframe,
            reason: `Max ${style} trades reached (${lane.maxOpenTrades})`,
            style,
          });
          continue;
        }

        const pos = await getPositionForInstrument(oanda, instrument);
        if (pos) {
          await recordSkip({
            source: mode === "ai" ? "auto" : "strategy",
            instrument,
            timeframe: lane.timeframe,
            reason: "Already in position",
            style,
          });
          continue;
        }

        if (mode === "strategy" || mode === "both") {
          const scan = await analyzeStrategies({
            instrument,
            timeframe: lane.timeframe,
            excludeStrategyIds: disabledIds,
            style,
          });
          const entryFilter = scan.consensus
            ? runEntryFilters({
                instrument,
                candles: scan.candles,
                openInstruments: openTrades.map((t) => t.instrument),
                // Swing entries aren't session-bound
                sessionFilterEnabled:
                  settings.sessionFilterEnabled && style !== "swing",
              })
            : { ok: true as const, reason: null };
          if (!scan.consensus) {
            const vetoNote = scan.htfVeto ? ` — ${scan.htfVeto}` : "";
            const disabledNote = disabledIds.length
              ? ` (auto-disabled: ${disabledIds.join(", ")})`
              : "";
            await recordSkip({
              source: "strategy",
              instrument,
              timeframe: lane.timeframe,
              reason: `No strategy consensus (BUY votes ${scan.buyVotes}, SELL ${scan.sellVotes})${vetoNote}${disabledNote}`,
              style,
            });
          } else if (!entryFilter.ok) {
            await recordSkip({
              source: "strategy",
              instrument,
              timeframe: lane.timeframe,
              signal: scan.consensus,
              reason: entryFilter.reason || "Blocked by entry filter",
              style,
            });
          } else if (scan.consensus.confidence < settings.autoMinConfidence) {
            await recordSkip({
              source: "strategy",
              instrument,
              timeframe: lane.timeframe,
              signal: scan.consensus,
              reason: `Strategy confidence ${scan.consensus.confidence.toFixed(2)} < ${settings.autoMinConfidence}`,
              style,
            });
          } else if (
            scan.consensus.takeProfit == null ||
            scan.consensus.stopLoss == null
          ) {
            await recordSkip({
              source: "strategy",
              instrument,
              timeframe: lane.timeframe,
              signal: scan.consensus,
              reason: "Missing TP/SL from strategies",
              style,
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
              timeframe: lane.timeframe,
              side: scan.consensus.bias,
              takeProfit: scan.consensus.takeProfit,
              stopLoss: scan.consensus.stopLoss,
              confidence: scan.consensus.confidence,
              rationale: scan.consensus.rationale,
              entryPrice: scan.consensus.entry,
              units: scan.suggestedUnits ?? undefined,
              strategyId: scan.consensus.id,
              style,
              skipFilters: true, // already checked above with the same data
            });
            openTrades = await getOpenTrades(oanda);
            laneOpen += 1;
            // If mode is both, still skip AI for this pair once filled
            continue;
          }
          if (mode === "strategy") continue;
        }

        if (mode === "ai" || mode === "both") {
          const analysis = await analyzeInstrument({
            instrument,
            timeframe: lane.timeframe,
            style,
          });
          const { signal } = analysis;

          if (signal.bias === "WAIT") {
            await recordSkip({
              source: "auto",
              instrument,
              timeframe: lane.timeframe,
              signal,
              reason: "AI said WAIT",
              style,
            });
            continue;
          }

          if (signal.confidence < settings.autoMinConfidence) {
            await recordSkip({
              source: "auto",
              instrument,
              timeframe: lane.timeframe,
              signal,
              reason: `AI confidence ${signal.confidence.toFixed(2)} < ${settings.autoMinConfidence}`,
              style,
            });
            continue;
          }

          if (signal.takeProfit == null || signal.stopLoss == null) {
            await recordSkip({
              source: "auto",
              instrument,
              timeframe: lane.timeframe,
              signal,
              reason: "Missing TP/SL",
              style,
            });
            continue;
          }

          await executeTrade({
            source: "auto",
            instrument,
            timeframe: lane.timeframe,
            side: signal.bias,
            takeProfit: signal.takeProfit,
            stopLoss: signal.stopLoss,
            confidence: signal.confidence,
            rationale: signal.rationale,
            entryPrice: analysis.entry,
            units: analysis.suggestedUnits ?? undefined,
            strategyId: "ai",
            style,
          });
          openTrades = await getOpenTrades(oanda);
          laneOpen += 1;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await recordSkip({
          source: mode === "ai" ? "auto" : "strategy",
          instrument,
          timeframe: lane.timeframe,
          reason: msg,
          style,
        });
      }
    }

    rt.lastRunAt = new Date().toISOString();
    rt.lastError = null;
    rt.lastStatus = `ok:${mode}`;
  } catch (e) {
    rt.lastError = e instanceof Error ? e.message : String(e);
    rt.lastStatus = "error";
  }
}

async function runCycle(styles: TradeStyle[] = ["day", "swing"]) {
  if (running) return;
  running = true;
  lastStatus = "running";
  try {
    await syncClosedTrades();
    for (const style of styles) {
      await runLane(style);
    }
    lastRunAt = new Date().toISOString();
    lastError = laneRuntime.day.lastError || laneRuntime.swing.lastError;
    lastStatus = `day:${laneRuntime.day.lastStatus} swing:${laneRuntime.swing.lastStatus}`;
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e);
    lastStatus = "error";
  } finally {
    running = false;
  }
}

const lastLaneScan: Record<TradeStyle, number> = { day: 0, swing: 0 };

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
        const now = Date.now();
        const due: TradeStyle[] = [];
        for (const style of ["day", "swing"] as TradeStyle[]) {
          const lane = laneConfig(settings, style);
          if (!lane.enabled) continue;
          const intervalMs = Math.max(1, lane.intervalMinutes) * 60_000;
          if (
            lastLaneScan[style] !== 0 &&
            now - lastLaneScan[style] < intervalMs
          ) {
            continue;
          }
          lastLaneScan[style] = now;
          due.push(style);
        }
        if (due.length) await runCycle(due);
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }
    })();
  }, 30_000);
  setTimeout(() => {
    lastLaneScan.day = 0;
    lastLaneScan.swing = 0;
    void runCycle().then(() => {
      const now = Date.now();
      lastLaneScan.day = now;
      lastLaneScan.swing = now;
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
  const now = Date.now();
  lastLaneScan.day = now;
  lastLaneScan.swing = now;
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
