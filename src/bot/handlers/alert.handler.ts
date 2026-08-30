import { Context, InlineKeyboard } from 'grammy';
import { db } from '../../db/database.js';
import { DexScreenerService } from '../../services/dexscreener.service.js';
import { RugCheckService } from '../../services/rugcheck.service.js';
import { RiskAnalysisEngine } from '../../services/risk.service.js';

export const handleAlertToken = async (ctx: Context, customAddress?: string) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const user = db.getUser(userId, ctx.from?.username);
  if (!user.isVip && user.bonusScans <= 0) {
    await ctx.reply(
      `👑 <b>VIP Feature: Early-Warning Token Alerts</b>\n\n` +
      `Real-time automated token monitoring (Volume spikes, price breakouts, liquidity drains) is exclusive to <b>VIP members</b>.\n\n` +
      `Type <b>/vip</b> to unlock for <b>0.1 SOL</b> (~$10) or type <b>/ref</b> to earn free access by inviting friends!`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  let tokenAddress = customAddress;
  if (!tokenAddress) {
    const text = ctx.message?.text || '';
    const parts = text.split(' ');
    if (parts.length > 1) {
      tokenAddress = parts[1].trim();
    }
  }

  // If no address provided, show active alert subscriptions
  if (!tokenAddress) {
    const tracked = db.getTrackedTokens(userId);
    let msg = `🔔 <b>YOUR TOKEN EARLY-WARNING ALERTS</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

    if (tracked.length === 0) {
      msg += `You have no active token alert subscriptions.\n\n`;
      msg += `<b>How to subscribe:</b>\n<code>/alert &lt;Solana_Token_CA&gt;</code>\n\n`;
      msg += `<i>Example:</i>\n<code>/alert DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263</code> ($BONK)\n`;
      msg += `Or simply tap <b>[🔔 Alert]</b> on any scan report!`;
    } else {
      msg += `<b>Active Monitored Tokens (${tracked.length}):</b>\n\n`;
      tracked.forEach((t, i) => {
        msg += `${i + 1}. <b>$${t.symbol}</b>\n   <code>${t.tokenAddress}</code>\n   Price: $${t.lastPriceUsd} | Liq: $${t.lastLiquidityUsd.toLocaleString()}\n\n`;
      });
      msg += `<i>AlphaViper monitors these tokens 24/7 and alerts you of volume spikes & price breakouts.</i>\n`;
      msg += `\nTo remove: <code>/unalert &lt;CA&gt;</code>`;
    }

    const keyboard = new InlineKeyboard().text('🔙 Main Menu', 'action:main_menu');
    await ctx.reply(msg.trim(), {
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
    return;
  }

  const loading = await ctx.reply(`⚡ <i>Initializing 24/7 alert monitor for <code>${tokenAddress.slice(0, 8)}...</code></i>`, {
    parse_mode: 'HTML'
  });

  try {
    const market = await DexScreenerService.getTokenData(tokenAddress);
    if (!market) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        loading.message_id,
        `❌ <b>Token Not Found</b>\nCould not find active Solana liquidity pairs for: <code>${tokenAddress}</code>`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    const security = await RugCheckService.checkToken(tokenAddress);
    const risk = RiskAnalysisEngine.evaluateRisk(market, security);

    const added = db.addTrackedToken(
      userId,
      tokenAddress,
      market.baseToken.symbol,
      Number(market.priceUsd) || 0,
      market.volume24h,
      market.liquidityUsd,
      risk.overallRiskScore
    );

    if (!added) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        loading.message_id,
        `⚠️ You are already monitoring <b>$${market.baseToken.symbol}</b> for alerts!`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    await ctx.api.editMessageText(
      ctx.chat!.id,
      loading.message_id,
      `✅ <b>Token Alert Activated!</b>\n\n` +
      `💎 <b>Token:</b> $${market.baseToken.symbol} (<code>${market.baseToken.name}</code>)\n` +
      `💰 <b>Baseline Price:</b> $${market.priceUsd}\n` +
      `📊 <b>Baseline 24h Vol:</b> $${market.volume24h.toLocaleString()}\n` +
      `💧 <b>Baseline Liquidity:</b> $${market.liquidityUsd.toLocaleString()}\n\n` +
      `🔔 <i>AlphaViper will ping your Telegram the moment a volume spike, price shock, or liquidity shift occurs!</i>`,
      { parse_mode: 'HTML' }
    );
  } catch (err: any) {
    console.error('Alert handler error:', err);
    await ctx.api.editMessageText(
      ctx.chat!.id,
      loading.message_id,
      `❌ Error activating token alert.`,
      { parse_mode: 'HTML' }
    );
  }
};

export const handleUnalertToken = async (ctx: Context) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const text = ctx.message?.text || '';
  const parts = text.split(' ');
  if (parts.length < 2) {
    await ctx.reply('Usage: <code>/unalert &lt;TokenCA&gt;</code>', { parse_mode: 'HTML' });
    return;
  }

  const tokenAddress = parts[1].trim();
  const removed = db.removeTrackedToken(userId, tokenAddress);

  if (removed) {
    await ctx.reply(`✅ Removed <code>${tokenAddress}</code> from your alert watchlist.`, { parse_mode: 'HTML' });
  } else {
    await ctx.reply(`❌ Token not found in your alert watchlist.`, { parse_mode: 'HTML' });
  }
};
