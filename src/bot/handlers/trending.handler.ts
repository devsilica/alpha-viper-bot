import { Context, InlineKeyboard } from 'grammy';
import { DexScreenerService } from '../../services/dexscreener.service.js';

export const handleTrendingTokens = async (ctx: Context) => {
  const loading = await ctx.reply('🔥 <i>Scanning Solana DEX pairs for top volume & breakout alpha...</i>', {
    parse_mode: 'HTML'
  });

  try {
    const trending = await DexScreenerService.getTrendingTokens();

    if (trending.length === 0) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        loading.message_id,
        '⚠️ No trending tokens found at the moment. Please try again shortly.',
        { parse_mode: 'HTML' }
      );
      return;
    }

    let message = `🔥 <b>TOP TRENDING SOLANA ALPHA</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    const keyboard = new InlineKeyboard();

    trending.slice(0, 7).forEach((t, i) => {
      const change24h = t.priceChange24h >= 0 ? `+${t.priceChange24h}% 🟢` : `${t.priceChange24h}% 🔴`;
      message += `<b>${i + 1}. $${t.baseToken.symbol}</b> (${t.baseToken.name})\n`;
      message += `   💰 Price: $${t.priceUsd} | 24h: ${change24h}\n`;
      message += `   💧 Liq: $${t.liquidityUsd.toLocaleString()} | Vol: $${t.volume24h.toLocaleString()}\n`;
      message += `   📍 <code>${t.baseToken.address}</code>\n\n`;

      if (i < 4) {
        keyboard.text(`🔍 Scan $${t.baseToken.symbol}`, `action:scan_ca:${t.baseToken.address}`).row();
      }
    });

    message += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n💡 <i>Tap any button below or copy CA to audit!</i>`;

    keyboard.text('🔙 Main Menu', 'action:main_menu');

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
      '❌ Error fetching trending tokens.',
      { parse_mode: 'HTML' }
    );
  }
};
