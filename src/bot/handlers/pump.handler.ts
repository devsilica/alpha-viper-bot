import { Context, InlineKeyboard } from 'grammy';
import { PumpFunService } from '../../services/pumpfun.service.js';

function renderProgressBar(percentage: number, length: number = 8): string {
  const clamped = Math.min(100, Math.max(0, percentage));
  const filledCount = Math.round((clamped / 100) * length);
  const emptyCount = length - filledCount;
  return '█'.repeat(filledCount) + '░'.repeat(emptyCount);
}

export const handlePumpRadar = async (ctx: Context) => {
  const loading = await ctx.reply('🎯 <i>Scanning pump.fun for breakout tokens near graduation (bonding curve 60%+)...</i>', {
    parse_mode: 'HTML'
  });

  try {
    const pumpTokens = await PumpFunService.getBondingCurveRadar();

    if (pumpTokens.length === 0) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        loading.message_id,
        '⚠️ No active pump.fun graduation tokens found right now. Check back in a few minutes.',
        { parse_mode: 'HTML' }
      );
      return;
    }

    let message = `🎯 <b>PUMP.FUN BONDING CURVE RADAR</b>\n`;
    message += `<i>Tokens near 100% migration to Raydium (5x–20x breakout zone)</i>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    const keyboard = new InlineKeyboard();

    pumpTokens.slice(0, 5).forEach((t, i) => {
      const progressBar = renderProgressBar(t.bondingProgress, 8);
      message += `<b>${i + 1}. $${t.symbol}</b> (<code>${t.name}</code>)\n`;
      message += `   📈 Curve: [${progressBar}] <b>${t.bondingProgress}%</b>\n`;
      message += `   💰 MC: $${t.marketCap.toLocaleString()} | Vol: $${t.volume24h.toLocaleString()}\n`;
      message += `   📍 <code>${t.address}</code>\n\n`;

      if (i < 3) {
        keyboard.text(`🔍 Audit $${t.symbol}`, `t:sc:${t.address}`).row();
      }
    });

    message += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n💡 <i>Tokens graduate to Raydium at ~$69k Market Cap!</i>`;
    keyboard.text('🔄 Refresh Radar', 'action:pump_radar').text('🔙 Main Menu', 'action:main_menu');

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
    console.error('Pump radar handler error:', err);
    await ctx.api.editMessageText(
      ctx.chat!.id,
      loading.message_id,
      '❌ Error fetching pump.fun radar.',
      { parse_mode: 'HTML' }
    );
  }
};
