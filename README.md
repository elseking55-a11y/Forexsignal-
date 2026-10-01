# Forexsignal- — ELISY254 AI Market Analyst

Live Deriv market-analysis frontend.

Features:
- Public Deriv WebSocket market data.
- Dynamic active-symbol discovery.
- Live ticks and historical candles.
- M5, M15, H1 and H4.
- EMA 9/21/50, RSI, ATR, momentum and swing support/resistance.
- BUY / SELL / WAIT analysis.
- Entry zone, invalidation and three reference targets.
- Mobile-first dark trading interface.
- No trade execution in this version.

Deriv documents active_symbols, ticks and ticks_history as public market-data endpoints. Candle granularities include 300 seconds (M5), 900 seconds (M15), 3600 seconds (H1) and 14400 seconds (H4).

Deployment: this is a static frontend and can be deployed directly to Vercel with no build command.

Next phase: keep analysis separate from execution. If auto-trading is added later, use authenticated trading connections server-side and never expose trading credentials in browser code.
