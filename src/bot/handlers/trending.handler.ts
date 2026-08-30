import { Context, InlineKeyboard } from 'grammy';
import { DexScreenerService } from '../../services/dexscreener.service.js';

export const handleTrendingTokens = async (ctx: Context) => {
  const loading = await ctx.reply('🔥 <i>Filtering Solana DEX pairs for verified momentum & liquidity quality...</i>', {
    parse_mode: 'HTML'
  });

  try {
    const trending = await DexScreenerService.getTrendingTokens();

    if (trending.length === 0) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        loading.message_id,
        '⚠️ No trending Solana pairs found at this moment. Please check back shortly.',
        { parse_mode: 'HTML' }
      );
      return;
    }

    let message = `🔥 <b>SOLANA ALPHA DISCOVERY & TRENDING</b>\n`;
    message += `<i>Ranked by on-chain liquidity velocity, flow, and momentum structure.</i>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    const keyboard = new InlineKeyboard();

    trending.slice(0, 6).forEach((t, i) => {
      const change24hStr = t.priceChange24h >= 0 ? `+${t.priceChange24h}% 🟢` : `${t.priceChange24h}% 🔴`;
      
      // Classify setup
      let setupCategory = '🟡 DEGEN PLAY';
      if (t.liquidityUsd >= 50000 && t.buySellRatio24h >= 1.2 && t.priceChange24h > 15) {
        setupCategory = '🟢 HEALTHY BREAKOUT';
      } else if (t.liquidityUsd < 15000 || t.buySellRatio24h < 0.8) {
        setupCategory = '🔴 HIGH RISK / CAUTION';
      }

      message += `<b>${i + 1}. $${t.baseToken.symbol}</b> (<code>${t.baseToken.name}</code>)\n`;
      message += `   🏷️ <b>Setup:</b> ${setupCategory}\n`;
      message += `   💰 <b>Price:</b> $${t.priceUsd} | <b>24h:</b> ${change24hStr}\n`;
      message += `   💧 <b>Liq:</b> $${t.liquidityUsd.toLocaleString()} | <b>24h Vol:</b> $${t.volume24h.toLocaleString()}\n`;
      message += `   👥 <b>Flow:</b> ${t.buySellRatio24h}:1 Buy/Sell Ratio\n`;
      message += `   📍 <code>${t.baseToken.address}</code>\n\n`;

      if (i < 3) {
        keyboard.text(`🔍 Audit $${t.baseToken.symbol}`, `t:sc:${t.baseToken.address}`).row();
      }
    });

    message += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n💡 <i>Tap any button below to run a deep security & risk audit!</i>`;

    keyboard.text('🔄 Refresh Discovery', 'action:trending').text('🔙 Main Menu', 'action:main_menu');

    await ctx.api.editMessageText(
      ctx.chat!.id,
      loading.message_id,
      message.trim(),
      {
        parse_mode: 'HTML',
        reply_markup: keyboard
      }
    );
  } catch (err: any) {
    console.error('Trending handler error:', err);
    await ctx.api.editMessageText(
      ctx.chat!.id,
      loading.message_id,
      '❌ Error fetching discovery pairs.',
      { parse_mode: 'HTML' }
    );
  }
};
