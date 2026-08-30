import { Bot, InlineKeyboard } from 'grammy';
import { db } from '../db/database.js';
import { DexScreenerService } from '../services/dexscreener.service.js';
import { JupiterService } from '../services/jupiter.service.js';

export class TokenAlertWorker {
  private static isRunning = false;
  private static COOLDOWN_MS = 15 * 60 * 1000;

  public static start(bot: Bot) {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('🔔 VIP Token Early-Warning Alert Worker started (Interval: 60s)...');

    setInterval(async () => {
      try {
        const trackedTokens = db.getTrackedTokens();
        if (trackedTokens.length === 0) return;

        const uniqueAddresses = Array.from(new Set(trackedTokens.map(tt => tt.tokenAddress)));

        for (const tokenAddress of uniqueAddresses) {
          const subscribers = trackedTokens.filter(
            tt => tt.tokenAddress.toLowerCase() === tokenAddress.toLowerCase()
          );
          if (subscribers.length === 0) continue;

          const snapshot = subscribers[0];
          const now = Date.now();

          if (snapshot.lastAlertAt && now - snapshot.lastAlertAt < this.COOLDOWN_MS) {
            continue;
          }

          const market = await DexScreenerService.getTokenData(tokenAddress);
          if (!market) continue;

          const currentPrice = Number(market.priceUsd) || 0;
          const currentVol = market.volume24h;
          const currentLiq = market.liquidityUsd;

          const priceDiffPct = snapshot.lastPriceUsd > 0
            ? ((currentPrice - snapshot.lastPriceUsd) / snapshot.lastPriceUsd) * 100
            : 0;

          const volDiffPct = snapshot.lastVolume24h > 0
            ? ((currentVol - snapshot.lastVolume24h) / snapshot.lastVolume24h) * 100
            : 0;

          const liqDiffPct = snapshot.lastLiquidityUsd > 0
            ? ((currentLiq - snapshot.lastLiquidityUsd) / snapshot.lastLiquidityUsd) * 100
            : 0;

          let triggerType: string | null = null;
          let triggerEmoji = '🔔';

          if (volDiffPct >= 50 && currentVol >= 25000) {
            triggerType = `🔥 VOLUME SPIKE (+${Math.round(volDiffPct)}%)`;
            triggerEmoji = '🔥';
          } else if (Math.abs(priceDiffPct) >= 18) {
            triggerType = priceDiffPct > 0 
              ? `🚀 PRICE BREAKOUT (+${priceDiffPct.toFixed(1)}%)`
              : `📉 SHARP PRICE DROP (${priceDiffPct.toFixed(1)}%)`;
            triggerEmoji = priceDiffPct > 0 ? '🚀' : '📉';
          } else if (liqDiffPct <= -15) {
            triggerType = `⚠️ LIQUIDITY DRAIN (${liqDiffPct.toFixed(1)}%)`;
            triggerEmoji = '⚠️';
          } else if (liqDiffPct >= 25) {
            triggerType = `💧 LIQUIDITY INJECTION (+${liqDiffPct.toFixed(1)}%)`;
            triggerEmoji = '💧';
          }

          if (triggerType) {
            const priceChangeFormatted = priceDiffPct >= 0 ? `+${priceDiffPct.toFixed(1)}% 🟢` : `${priceDiffPct.toFixed(1)}% 🔴`;
            const flowBadge = market.buySellRatio24h >= 1.2 ? '🟢 Strong Buy Flow' : (market.buySellRatio24h < 0.8 ? '🔴 Heavy Sell Flow' : '🟡 Neutral Flow');

            const alertMessage = `
${triggerEmoji} <b>ALPHAVIPER TOKEN ALERT</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
💎 <b>Token:</b> <b>$${market.baseToken.symbol}</b> (<code>${market.baseToken.name}</code>)
🎯 <b>TRIGGER:</b> <b>${triggerType}</b>

💰 <b>Current Price:</b> $${market.priceUsd} (${priceChangeFormatted})
📊 <b>24h Volume:</b> $${currentVol.toLocaleString()} (<i>Prev: $${Math.round(snapshot.lastVolume24h).toLocaleString()}</i>)
💧 <b>Liquidity:</b> $${currentLiq.toLocaleString()} (<i>${liqDiffPct >= 0 ? '+' : ''}${liqDiffPct.toFixed(1)}%</i>)
👥 <b>Flow Ratio:</b> ${market.buySellRatio24h}:1 (${flowBadge})
━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 <b>CA:</b> <code>${tokenAddress}</code>
            `;

            const keyboard = new InlineKeyboard()
              .text('🔍 Scan Token', `t:sc:${tokenAddress}`)
              .url('⚡ Buy on Jupiter', JupiterService.getSwapUrl(tokenAddress))
              .row()
              .url('📊 DexScreener Chart', market.url)
              .text('🔕 Untrack Token', `t:un:${tokenAddress}`);

            for (const sub of subscribers) {
              try {
                await bot.api.sendMessage(sub.userId, alertMessage.trim(), {
                  parse_mode: 'HTML',
                  reply_markup: keyboard,
                  link_preview_options: { is_disabled: true }
                });
              } catch (sendErr: any) {
                console.warn(`Token alert send error for user ${sub.userId}:`, sendErr.message);
              }
            }

            db.updateTrackedTokenSnapshot(tokenAddress, currentPrice, currentVol, currentLiq, snapshot.lastRiskScore, true);
          } else {
            db.updateTrackedTokenSnapshot(tokenAddress, currentPrice, currentVol, currentLiq, snapshot.lastRiskScore, false);
          }
        }
      } catch (err: any) {
        console.error('Token alert worker error:', err.message);
      }
    }, 60000);
  }
}
