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
    "minRiskReward" REAL NOT NULL DEFAULT 1,
    "sizingMode" TEXT NOT NULL DEFAULT 'full_balance',
    "balanceUtilization" REAL NOT NULL DEFAULT 100,
    "autoTradeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoWatchlist" TEXT NOT NULL DEFAULT 'EUR_USD,USD_JPY,GBP_USD',
    "autoTimeframe" TEXT NOT NULL DEFAULT 'H1',
    "autoIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "autoMinConfidence" REAL NOT NULL DEFAULT 0.7,
    "maxOpenTrades" INTEGER NOT NULL DEFAULT 1,
    "autoMode" TEXT NOT NULL DEFAULT 'strategy',
    "enabledStrategies" TEXT NOT NULL DEFAULT 'ema_cross,rsi_reversion,macd_cross,bb_bounce',
    "strategyMinVotes" INTEGER NOT NULL DEFAULT 1,
    "atrSlMult" REAL NOT NULL DEFAULT 1.5,
    "atrTpMult" REAL NOT NULL DEFAULT 2.5,
    "liveAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "liveAutoAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "dailyMaxLoss" REAL,
    "dailyMaxWin" REAL,
    "weeklyMaxLoss" REAL,
    "weeklyMaxWin" REAL,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Settings" ("atrSlMult", "atrTpMult", "autoIntervalMinutes", "autoMinConfidence", "autoMode", "autoTimeframe", "autoTradeEnabled", "autoWatchlist", "dailyMaxLoss", "dailyMaxWin", "discordWebhookEnc", "enabledStrategies", "geminiKeyEnc", "geminiModel", "id", "liveAcknowledged", "liveAutoAcknowledged", "maxOpenTrades", "maxUnits", "minRiskReward", "oandaAccountId", "oandaEnv", "oandaTokenEnc", "riskPercent", "strategyMinVotes", "updatedAt", "weeklyMaxLoss", "weeklyMaxWin") SELECT "atrSlMult", "atrTpMult", "autoIntervalMinutes", "autoMinConfidence", "autoMode", "autoTimeframe", "autoTradeEnabled", "autoWatchlist", "dailyMaxLoss", "dailyMaxWin", "discordWebhookEnc", "enabledStrategies", "geminiKeyEnc", "geminiModel", "id", "liveAcknowledged", "liveAutoAcknowledged", "maxOpenTrades", "maxUnits", "minRiskReward", "oandaAccountId", "oandaEnv", "oandaTokenEnc", "riskPercent", "strategyMinVotes", "updatedAt", "weeklyMaxLoss", "weeklyMaxWin" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
