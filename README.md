# TideDesk — OANDA AI Forex Trading Desk

Web app for AI-assisted forex trading on **OANDA**, with manual confirm flow, optional auto-trade, trade journal, and daily/weekly P/L circuit breakers.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- SQLite via Prisma
- OANDA REST v3
- Google Gemini for signals
- `lightweight-charts` for candles

## Quick start

```bash
cp .env.example .env
# edit AUTH_USERNAME, AUTH_PASSWORD, SESSION_SECRET, ENCRYPTION_KEY

npm install
npx prisma migrate deploy
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), log in, then go to **Settings** and paste:

- OANDA Practice API token + Account ID
- Gemini API key
- Optional daily/weekly win & loss limits
- Optional auto-trade watchlist

## Features

- **Login** — single-user session gate
- **Settings** — encrypted broker/AI secrets, risk caps, auto-trade, circuit breakers
- **Strategy engine (no external AI)** — EMA cross, RSI pullback, MACD, Bollinger bounce with ATR TP/SL
- **Trade desk** — pair/TF chart → Scan strategies or Gemini → confirm market order
- **Auto-trade** — interval worker in `strategy` / `ai` / `both` mode
- **History** — filter by `manual` / `auto` / `strategy`
- **Limits** — daily/weekly max loss & max win halt both manual and auto entries (UTC)

## How the guardrails protect you

TideDesk is built survival-first. Pick a **Risk profile** in Settings (Safe is default) and these run automatically:

- **Small position sizing** — Safe risks 1% of equity per trade at the stop-loss, so a losing streak stays survivable
- **Drawdown kill switch** — trading halts if the account falls 10% (Safe) below its peak equity
- **Loss-streak kill switch** — 4 losses in a row forces a mandatory break
- **Cooldown** — after any halt, trading stays paused (default 60 min) so nothing "revenge trades"
- **Daily/weekly limits** — optional max loss and max win halts in account currency
- **Session filter** — entries only during London/NY hours when spreads are sane
- **Trend filter** — blocks trades that fight the higher-timeframe direction
- **Correlation guard** — won't open a second trade sharing a currency with an open one
- **Volatility check** — skips entries during news-spike conditions
- **Strategy benching** — strategies that lose money over their recent trades are auto-disabled
- **Backtest page** — replay each strategy on history before trusting it live

No system can guarantee profits. These guardrails cap damage and keep only strategies with a measured edge in play.

## Safety defaults

- Practice environment preferred; Live requires acknowledgment
- Auto-trade off by default; Live auto requires a second acknowledgment
- Full-balance sizing on Live requires an extra explicit acknowledgment
- TP/SL and min R:R enforced on every order
- Duplicate position on an instrument is blocked

## Env vars

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | SQLite path (`file:./dev.db`) |
| `AUTH_USERNAME` / `AUTH_PASSWORD` | Site login |
| `SESSION_SECRET` | iron-session cookie secret (32+ chars) |
| `ENCRYPTION_KEY` | 64-hex-char AES-256 key for secrets at rest |

Generate an encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## VPS upgrade (kostintrades.xyz)

Always pull from `cursor/oanda-ai-trading-webapp-a847`. `npm run build` applies pending Prisma migrations automatically.

```bash
cd /path/to/forexbot
git fetch origin
git checkout cursor/oanda-ai-trading-webapp-a847
git pull origin cursor/oanda-ai-trading-webapp-a847
npm install
npm run build
sudo systemctl restart tidedesk
```

If you see an error like `column Settings.riskProfile does not exist`, the DB is behind the code. Run migrations against the **same** `DATABASE_URL` your systemd service uses, then restart:

```bash
npx prisma migrate deploy
sudo systemctl restart tidedesk
```
