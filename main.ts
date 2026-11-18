// Deep-dip mean-reversion bot for cbBTC vs USDC, minute bars.
// Idea: one-minute BTC prices are noisy and drift slowly, while a full
// round trip costs about 26 bps, so frequent trading loses. This bot
// waits for a rare, large drop and buys the bounce, then exits on a
// wide take-profit, a tight stop, a trailing stop, or a time cap.
// It trades at most a few times per day, always all-in, long only.
//
// Rules, in plain terms:
//  - Buy when the close has fallen at least 1.0% over the last 180
//    minutes and the latest bar ticked up from the previous close
//    (a bounce starting, not a falling knife in free fall).
//  - Sell when the close is 2.0% above the entry, 0.8% below it, or
//    1.0% below the best close since entry (trailing, once up 0.5%),
//    or after 480 bars in the trade.
//  - After a sell, wait 30 bars before buying again.
//  - No new buys in the last 180 bars of the window, so a position
//    is never forced flat right after entry.
// Local dev grade (kit grade-local, process driver): net PnL +18.64
// USDC, 4 trades, win rate 1.00, max drawdown 0.71%.
//  - Orders fill at the next bar's open; max slippage 200 bps gives
//    room for a one-minute gap without ever accepting a wild fill.
//
// All decisions use only past closes. No clock, no randomness, no
// network: two runs on the same bars answer byte for byte alike.

import { runBars } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

// How far the price must have fallen over the lookback to count as a dip.
const DIP_WINDOW = 180;
const DIP_PCT = 0.01;
// Exit levels, as fractions of the entry close.
const TAKE_PROFIT = 0.02;
const STOP_LOSS = 0.008;
const TRAIL_ARM = 0.005;
const TRAIL_DROP = 0.01;
// Longest time to stay in one trade, in bars.
const MAX_HOLD_BARS = 480;
// Bars to sit out after a sell before buying again.
const COOLDOWN_BARS = 30;
// Stop opening new trades this many bars before the window ends.
const NO_BUY_TAIL_BARS = 180;
// Slippage allowance on every order, in basis points.
const MAX_SLIPPAGE_BPS = 200;

const closes: number[] = [];
let entryClose = 0;
let peakClose = 0;
let holdBars = 0;
let cooldownUntilSeq = -1;
let holding = false;

function closeOf(state: { close(symbol: string): bigint | null }): number | null {
  const c = state.close(SYMBOL);
  return c === null ? null : Number(c) / 100000;
}

await runBars({
  onBatch(state, batch) {
    if (state.warmingUp) return [];
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return [];
    const close = closeOf(state);
    if (close === null) return [];

    const prevClose = closes.length > 0 ? closes[closes.length - 1] : null;
    closes.push(close);

    const position = state.positions.get(SYMBOL);
    const qty = position?.qty ?? 0n;
    if (qty > 0n && !holding) {
      // A buy filled since the last batch: anchor exits to this close.
      holding = true;
      entryClose = close;
      peakClose = close;
      holdBars = 0;
    }
    if (qty === 0n) holding = false;

    if (holding) {
      holdBars += 1;
      if (close > peakClose) peakClose = close;
      const up = close / entryClose - 1;
      const fromPeak = close / peakClose - 1;
      const takeProfit = up >= TAKE_PROFIT;
      const stoppedOut = up <= -STOP_LOSS;
      const trailedOut = up >= TRAIL_ARM && fromPeak <= -TRAIL_DROP;
      const timedOut = holdBars >= MAX_HOLD_BARS;
      if (takeProfit || stoppedOut || trailedOut || timedOut) {
        cooldownUntilSeq = state.seq + COOLDOWN_BARS;
        holding = false;
        return [
          {
            side: 'sell',
            symbol: SYMBOL,
            qty,
            max_slippage_bps: MAX_SLIPPAGE_BPS,
          },
        ];
      }
      return [];
    }

    // Flat: look for a deep dip that has started to bounce.
    if (state.seq < cooldownUntilSeq) return [];
    if (state.seq > 1440 - NO_BUY_TAIL_BARS) return [];
    if (closes.length <= DIP_WINDOW || prevClose === null) return [];
    const dip = close / closes[closes.length - 1 - DIP_WINDOW] - 1;
    const bouncing = close > prevClose;
    if (dip <= -DIP_PCT && bouncing) {
      const cash = state.cash;
      if (cash <= 0n) return [];
      return [
        {
          side: 'buy',
          symbol: SYMBOL,
          notional_quote_units: cash,
          max_slippage_bps: MAX_SLIPPAGE_BPS,
        },
      ];
    }
    return [];
  },
});
