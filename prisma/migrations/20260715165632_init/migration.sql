-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "oandaTokenEnc" TEXT,
    "oandaAccountId" TEXT,
    "oandaEnv" TEXT NOT NULL DEFAULT 'practice',
    "geminiKeyEnc" TEXT,
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

-- CreateTable
CREATE TABLE "TradeJournal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "source" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "instrument" TEXT NOT NULL,
    "side" TEXT,
    "units" INTEGER,
    "entryPrice" REAL,
    "takeProfit" REAL,
    "stopLoss" REAL,
    "confidence" REAL,
    "rationale" TEXT,
    "oandaOrderId" TEXT,
    "oandaTradeId" TEXT,
    "realizedPl" REAL,
    "closedAt" DATETIME,
    "lesson" TEXT,
    "timeframe" TEXT,
    "skipReason" TEXT
);
