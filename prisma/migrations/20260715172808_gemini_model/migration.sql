-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "oandaTokenEnc" TEXT,
    "oandaAccountId" TEXT,
    "oandaEnv" TEXT NOT NULL DEFAULT 'practice',
    "geminiKeyEnc" TEXT,
    "geminiModel" TEXT NOT NULL DEFAULT 'gemini-1.5-flash',
    "discordWebhookEnc" TEXT,
    "riskPercent" REAL NOT NULL DEFAULT 1,
    "maxUnits" INTEGER NOT NULL DEFAULT 10000,
    "minRiskReward" REAL NOT NULL DEFAULT 1,
    "autoTradeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoWatchlist" TEXT NOT NULL DEFAULT 'EUR_USD,USD_JPY,GBP_USD',
    "autoTimeframe" TEXT NOT NULL DEFAULT 'H1',
    "autoIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "autoMinConfidence" REAL NOT NULL DEFAULT 0.7,
    "maxOpenTrades" INTEGER NOT NULL DEFAULT 3,
    "liveAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "liveAutoAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "dailyMaxLoss" REAL,
    "dailyMaxWin" REAL,
    "weeklyMaxLoss" REAL,
    "weeklyMaxWin" REAL,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Settings" ("autoIntervalMinutes", "autoMinConfidence", "autoTimeframe", "autoTradeEnabled", "autoWatchlist", "dailyMaxLoss", "dailyMaxWin", "discordWebhookEnc", "geminiKeyEnc", "id", "liveAcknowledged", "liveAutoAcknowledged", "maxOpenTrades", "maxUnits", "minRiskReward", "oandaAccountId", "oandaEnv", "oandaTokenEnc", "riskPercent", "updatedAt", "weeklyMaxLoss", "weeklyMaxWin") SELECT "autoIntervalMinutes", "autoMinConfidence", "autoTimeframe", "autoTradeEnabled", "autoWatchlist", "dailyMaxLoss", "dailyMaxWin", "discordWebhookEnc", "geminiKeyEnc", "id", "liveAcknowledged", "liveAutoAcknowledged", "maxOpenTrades", "maxUnits", "minRiskReward", "oandaAccountId", "oandaEnv", "oandaTokenEnc", "riskPercent", "updatedAt", "weeklyMaxLoss", "weeklyMaxWin" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
