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
npx prisma migrate dev --name init
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

## Safety defaults

- Practice environment preferred; Live requires acknowledgment
- Auto-trade off by default; Live auto requires a second acknowledgment
- Risk % capped at 5% server-side; TP/SL and min R:R enforced
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
