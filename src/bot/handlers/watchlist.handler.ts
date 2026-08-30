import { Context, InlineKeyboard } from 'grammy';
import { db } from '../../db/database.js';
import { DexScreenerService } from '../../services/dexscreener.service.js';
import { RugCheckService } from '../../services/rugcheck.service.js';
import { ScoringEngine } from '../../services/scoring.engine.js';

export const handleWatchToken = async (ctx: Context, customAddress?: string) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  let tokenAddress = customAddress;
  if (!tokenAddress) {
    const text = ctx.message?.text || '';
    const parts = text.split(' ');
    if (parts.length > 1) {
      tokenAddress = parts[1].trim();
    }
  }

  if (!tokenAddress) {
    await handleViewWatchlist(ctx);
    return;
  }

  const loading = await ctx.reply(`⭐ <i>Adding <code>${tokenAddress.slice(0, 8)}...</code> to your watchlist...</i>`, {
    parse_mode: 'HTML'
  });

  try {
    const [market, security] = await Promise.all([
      DexScreenerService.getTokenData(tokenAddress),
      RugCheckService.checkToken(tokenAddress)
    ]);

    if (!market) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        loading.message_id,
        `❌ <b>Token Not Found</b>: Could not find active Solana liquidity pairs for <code>${tokenAddress}</code>`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    const scoreResult = ScoringEngine.evaluate(market, security);

    const added = db.addToWatchlist(
      userId,
      tokenAddress,
      market.baseToken.symbol,
      market.baseToken.name,
      market.priceUsd,
      market.liquidityUsd,
      scoreResult.overallScore,
      market.priceChange24h
    );

    if (!added) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        loading.message_id,
        `⚠️ <b>$${market.baseToken.symbol}</b> is already in your watchlist!`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    await ctx.api.editMessageText(
      ctx.chat!.id,
      loading.message_id,
      `⭐ <b>Token Added to Watchlist!</b>\n\n` +
      `💎 <b>$${market.baseToken.symbol}</b> (<code>${market.baseToken.name}</code>)\n` +
      `💰 <b>Price:</b> $${market.priceUsd} (${market.priceChange24h >= 0 ? '+' : ''}${market.priceChange24h}% 24h)\n` +
      `💧 <b>Liquidity:</b> $${market.liquidityUsd.toLocaleString()}\n` +
      `🎯 <b>AlphaViper Score:</b> <b>${scoreResult.overallScore}/100</b> (${scoreResult.overallBadge})\n` +
      `📊 <b>Momentum:</b> ${scoreResult.momentum.trajectory}\n\n` +
      `💡 <i>View your full watchlist anytime by typing <b>/watchlist</b>.</i>`,
      { parse_mode: 'HTML' }
    );
  } catch (err: any) {
    console.error('Watch handler error:', err);
    await ctx.api.editMessageText(
      ctx.chat!.id,
      loading.message_id,
      `❌ Error adding token to watchlist.`,
      { parse_mode: 'HTML' }
    );
  }
};

export const handleViewWatchlist = async (ctx: Context) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const watchlist = db.getWatchlist(userId);
  const keyboard = new InlineKeyboard();

  if (watchlist.length === 0) {
    const emptyMsg = `
⭐ <b>YOUR TOKEN WATCHLIST</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
You have no saved tokens in your watchlist yet.

<b>How to add tokens:</b>
• Send: <code>/watch &lt;Solana_Token_CA&gt;</code>
• Or tap <b>[⭐ Watch]</b> on any intelligence report!
━━━━━━━━━━━━━━━━━━━━━━━━━━
    `;
    keyboard.text('🔍 Scan Token', 'action:scan_prompt').text('🔙 Main Menu', 'action:main_menu');
    await ctx.reply(emptyMsg.trim(), { parse_mode: 'HTML', reply_markup: keyboard });
    return;
  }

  let msg = `⭐ <b>MY TOKEN WATCHLIST (${watchlist.length} Monitored)</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  watchlist.forEach((t, i) => {
    const changeStr = t.priceChange24h >= 0 ? `+${t.priceChange24h}% 🟢` : `${t.priceChange24h}% 🔴`;
    let signalBadge = '🟢 HEALTHY STRUCTURE';
    if (t.score < 40 || t.priceChange24h < -25) {
      signalBadge = '🔴 HIGH RISK / WEAKENING';
    } else if (t.score < 60 || t.priceChange24h < 0) {
      signalBadge = '🟡 STRUCTURE CONSOLIDATING';
    }

    msg += `<b>${i + 1}. $${t.symbol}</b> (<code>${t.name}</code>)\n`;
    msg += `   💰 <b>Price:</b> $${t.priceUsd} | <b>24h:</b> ${changeStr}\n`;
    msg += `   💧 <b>Liq:</b> $${t.liquidityUsd.toLocaleString()} | 🎯 <b>Score:</b> <b>${t.score}/100</b>\n`;
    msg += `   🏷️ <b>Signal:</b> ${signalBadge}\n`;
    msg += `   📍 <code>${t.tokenAddress}</code>\n\n`;

    if (i < 4) {
      keyboard.text(`🔍 Audit $${t.symbol}`, `t:sc:${t.tokenAddress}`).row();
    }
  });

  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\nTo remove: <code>/unwatch &lt;CA&gt;</code>`;
  keyboard.text('🔙 Main Menu', 'action:main_menu');

  await ctx.reply(msg.trim(), {
    parse_mode: 'HTML',
    reply_markup: keyboard
  });
};

export const handleUnwatchToken = async (ctx: Context) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const text = ctx.message?.text || '';
  const parts = text.split(' ');
  if (parts.length < 2) {
    await ctx.reply('Usage: <code>/unwatch &lt;TokenCA&gt;</code>', { parse_mode: 'HTML' });
    return;
  }

  const tokenAddress = parts[1].trim();
  const removed = db.removeFromWatchlist(userId, tokenAddress);

  if (removed) {
    await ctx.reply(`✅ Removed <code>${tokenAddress}</code> from your watchlist.`, { parse_mode: 'HTML' });
  } else {
    await ctx.reply(`❌ Token not found in your watchlist.`, { parse_mode: 'HTML' });
  }
};
