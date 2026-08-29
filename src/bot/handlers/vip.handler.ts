import { Context } from 'grammy';
import { db } from '../../db/database.js';
import { config } from '../../config/env.js';
import { SolanaService } from '../../services/solana.service.js';
import { createVipUpgradeKeyboard } from '../menus/main.menu.js';

export const handleVipInfo = async (ctx: Context) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const user = db.getUser(userId, ctx.from?.username);
  const treasury = SolanaService.getTreasuryAddress();

  let vipStatusText = '⚪ <b>Tier:</b> FREE (5 scans/day)';
  if (user.isVip) {
    const expiryStr = user.vipExpiresAt ? new Date(user.vipExpiresAt).toLocaleDateString() : 'Permanent';
    vipStatusText = `👑 <b>Tier: VIP ACTIVE</b> (Expires: ${expiryStr})`;
  }

  const message = `
👑 <b>ALPHAVIPER VIP MEMBERSHIP</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
${vipStatusText}

🔥 <b>VIP Exclusive Superpowers:</b>
• ⚡ <b>Unlimited Token Audits & Scans</b>
• 🤖 <b>Gemini Deep AI Momentum & Risk Predictions</b>
• 👛 <b>Real-Time Whale Wallet Buy/Sell Telegram Pings</b>
• 🎯 <b>High-Speed Breakout Alpha Feed</b>
• 🛡️ <b>Priority Honeypot & Rug Detection Engine</b>

💰 <b>Subscription Price:</b> <b>${config.VIP_PRICE_SOL} SOL</b> / 30 Days

💳 <b>HOW TO UPGRADE ON-CHAIN:</b>
1. Send exactly <b>${config.VIP_PRICE_SOL} SOL</b> from your Phantom, Solflare, or Binance wallet to the official treasury address below:

📍 <code>${treasury}</code>
<i>(Tap address above to copy)</i>

2. After sending, copy your <b>Transaction Hash / Signature</b>.
3. Send it to the bot:
<code>/verify &lt;Your_Transaction_Signature&gt;</code>

⚡ <i>The bot verifies on-chain in ~3 seconds and unlocks VIP instantly!</i>
━━━━━━━━━━━━━━━━━━━━━━━━━━
  `;

  const keyboard = createVipUpgradeKeyboard(treasury);

  await ctx.reply(message.trim(), {
    parse_mode: 'HTML',
    reply_markup: keyboard
  });
};

export const handleVerifyPayment = async (ctx: Context) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const text = ctx.message?.text || '';
  const parts = text.split(' ');

  if (parts.length < 2) {
    await ctx.reply(
      `🔍 <b>How to verify your payment:</b>\n\n` +
      `Send: <code>/verify &lt;Solana_Transaction_Signature&gt;</code>\n\n` +
      `<i>Example:</i> <code>/verify 4hKx...9ZqP</code>`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  const signature = parts[1].trim();

  const loading = await ctx.reply('⏳ <i>Verifying transaction on Solana blockchain...</i>', {
    parse_mode: 'HTML'
  });

  const result = await SolanaService.verifyPaymentSignature(signature, userId, config.VIP_PRICE_SOL);

  if (result.success) {
    await ctx.api.editMessageText(
      ctx.chat!.id,
      loading.message_id,
      `🎉 <b>VIP UPGRADE SUCCESSFUL!</b>\n\n` +
      `💰 <b>Amount Received:</b> ${result.amountSol?.toFixed(3)} SOL\n` +
      `👑 <b>Status:</b> VIP Unlocked for 30 Days\n\n` +
      `Enjoy unlimited token scans, instant whale alerts, and AI alpha scores! 🚀`,
      { parse_mode: 'HTML' }
    );
  } else {
    await ctx.api.editMessageText(
      ctx.chat!.id,
      loading.message_id,
      `${result.message}\n\n<i>If you just sent the transaction, please wait a few seconds for blockchain confirmation and try again.</i>`,
      { parse_mode: 'HTML' }
    );
  }
};
