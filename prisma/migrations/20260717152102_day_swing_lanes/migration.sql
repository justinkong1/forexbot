-- AlterTable
ALTER TABLE "TradeJournal" ADD COLUMN "style" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "oandaTokenEnc" TEXT,
    "oandaAccountId" TEXT,
    "oandaEnv" TEXT NOT NULL DEFAULT 'practice',
    "geminiKeyEnc" TEXT,
    "geminiModel" TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
    "discordWebhookEnc" TEXT,
    "riskPercent" REAL NOT NULL DEFAULT 1,
    "maxUnits" INTEGER NOT NULL DEFAULT 10000,
    "minRiskReward" REAL NOT NULL DEFAULT 1.5,
    "sizingMode" TEXT NOT NULL DEFAULT 'risk_sl',
    "balanceUtilization" REAL NOT NULL DEFAULT 100,
    "autoTradeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoWatchlist" TEXT NOT NULL DEFAULT 'EUR_USD,USD_JPY,GBP_USD',
    "autoTimeframe" TEXT NOT NULL DEFAULT 'H1',
    "autoIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "autoMinConfidence" REAL NOT NULL DEFAULT 0.7,
    "maxOpenTrades" INTEGER NOT NULL DEFAULT 1,
    "autoMode" TEXT NOT NULL DEFAULT 'strategy',
    "enabledStrategies" TEXT NOT NULL DEFAULT 'ema_cross,rsi_reversion,macd_cross,bb_bounce',
    "strategyMinVotes" INTEGER NOT NULL DEFAULT 2,
    "atrSlMult" REAL NOT NULL DEFAULT 1.5,
    "atrTpMult" REAL NOT NULL DEFAULT 2.5,
    "liveAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "liveAutoAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "dailyMaxLoss" REAL,
    "dailyMaxWin" REAL,
    "weeklyMaxLoss" REAL,
    "weeklyMaxWin" REAL,
    "riskProfile" TEXT NOT NULL DEFAULT 'safe',
    "maxDrawdownPercent" REAL DEFAULT 10,
    "lossStreakHalt" INTEGER DEFAULT 4,
    "haltCooldownMinutes" INTEGER NOT NULL DEFAULT 60,
    "sessionFilterEnabled" BOOLEAN NOT NULL DEFAULT true,
    "htfTrendFilterEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoDisableStrategies" BOOLEAN NOT NULL DEFAULT true,
    "peakEquity" REAL,
    "haltedUntil" DATETIME,
    "fullBalanceLiveAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "dayEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dayWatchlist" TEXT NOT NULL DEFAULT 'EUR_USD,USD_JPY,GBP_USD',
    "dayTimeframe" TEXT NOT NULL DEFAULT 'M15',
    "dayIntervalMinutes" INTEGER NOT NULL DEFAULT 15,
    "dayStrategies" TEXT NOT NULL DEFAULT 'ema_cross,rsi_reversion,macd_cross,bb_bounce',
    "dayAtrSlMult" REAL NOT NULL DEFAULT 1.5,
    "dayAtrTpMult" REAL NOT NULL DEFAULT 2.5,
    "dayMaxOpenTrades" INTEGER NOT NULL DEFAULT 2,
    "swingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "swingWatchlist" TEXT NOT NULL DEFAULT 'EUR_USD,GBP_USD,AUD_USD',
    "swingTimeframe" TEXT NOT NULL DEFAULT 'H4',
    "swingIntervalMinutes" INTEGER NOT NULL DEFAULT 240,
    "swingStrategies" TEXT NOT NULL DEFAULT 'donchian_break,htf_pullback,ema_cross,macd_cross',
    "swingAtrSlMult" REAL NOT NULL DEFAULT 2.5,
    "swingAtrTpMult" REAL NOT NULL DEFAULT 5,
    "swingMaxOpenTrades" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Settings" ("atrSlMult", "atrTpMult", "autoDisableStrategies", "autoIntervalMinutes", "autoMinConfidence", "autoMode", "autoTimeframe", "autoTradeEnabled", "autoWatchlist", "balanceUtilization", "dailyMaxLoss", "dailyMaxWin", "discordWebhookEnc", "enabledStrategies", "fullBalanceLiveAcknowledged", "geminiKeyEnc", "geminiModel", "haltCooldownMinutes", "haltedUntil", "htfTrendFilterEnabled", "id", "liveAcknowledged", "liveAutoAcknowledged", "lossStreakHalt", "maxDrawdownPercent", "maxOpenTrades", "maxUnits", "minRiskReward", "oandaAccountId", "oandaEnv", "oandaTokenEnc", "peakEquity", "riskPercent", "riskProfile", "sessionFilterEnabled", "sizingMode", "strategyMinVotes", "updatedAt", "weeklyMaxLoss", "weeklyMaxWin") SELECT "atrSlMult", "atrTpMult", "autoDisableStrategies", "autoIntervalMinutes", "autoMinConfidence", "autoMode", "autoTimeframe", "autoTradeEnabled", "autoWatchlist", "balanceUtilization", "dailyMaxLoss", "dailyMaxWin", "discordWebhookEnc", "enabledStrategies", "fullBalanceLiveAcknowledged", "geminiKeyEnc", "geminiModel", "haltCooldownMinutes", "haltedUntil", "htfTrendFilterEnabled", "id", "liveAcknowledged", "liveAutoAcknowledged", "lossStreakHalt", "maxDrawdownPercent", "maxOpenTrades", "maxUnits", "minRiskReward", "oandaAccountId", "oandaEnv", "oandaTokenEnc", "peakEquity", "riskPercent", "riskProfile", "sessionFilterEnabled", "sizingMode", "strategyMinVotes", "updatedAt", "weeklyMaxLoss", "weeklyMaxWin" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Seed the day lane from the legacy single-lane auto-trade config
UPDATE "Settings" SET
    "dayWatchlist" = "autoWatchlist",
    "dayTimeframe" = CASE WHEN "autoTimeframe" IN ('M5', 'M15', 'M30', 'H1') THEN "autoTimeframe" ELSE 'M15' END,
    "dayStrategies" = "enabledStrategies",
    "dayAtrSlMult" = "atrSlMult",
    "dayAtrTpMult" = "atrTpMult";

-- Tag existing journal rows as day trades (the only style that existed)
UPDATE "TradeJournal" SET "style" = 'day' WHERE "style" IS NULL;
