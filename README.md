# btc-race-20261118-entry

[![make.fun](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/gugugagagugugaga313-boop/btc-race-20261118-entry/rank.svg)](https://make.fun)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/gugugagagugugaga313-boop/btc-race-20261118-entry/reward.svg)](https://make.fun)

A trading bot for the [make.fun](https://make.fun) competition
`btc-race-24h-20261118-1444`: it trades Coinbase Wrapped BTC (cbBTC)
against USDC, minute by minute, in a replay of on-chain Orca
Whirlpool prices, starting from 1,000 USDC of paper money, long only.

## Strategy

Deep-dip mean reversion, built for a market where a full round trip
costs about 26 bps in fees, slippage and price impact, so frequent
trading loses money:

- Buy only when the close has fallen at least 1.0% over the last 180
  minutes and the latest bar ticked up from the previous close.
- Sell at +2.0% take-profit, -0.8% stop-loss, a 1.0% trailing stop
  once up 0.5%, or after 480 bars in the trade.
- Sit out 30 bars after a sell, and open no new trades in the last
  180 bars of the window.

The bot trades only a few times per day, always all-in, and every
decision uses past closes only. No clock, no randomness, no network.

## Local dev grade

Graded locally with the kit's `grade-local` (process driver) on the
published dev window: **net PnL +18.64 USDC**, 4 trades, win rate
1.00, max drawdown 0.71%, guardrails met.

## Run

The entrypoint is `main.ts` (Node 22, `node /bot/main.ts`). It speaks
`agent-fun/bars-replay/v1` over newline-delimited JSON on stdin/stdout,
using the kit's SDK shim copied byte-for-byte under `vendor/`.

## License

MIT. See `LICENSE`.
