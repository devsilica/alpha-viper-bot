import { Context, InlineKeyboard } from 'grammy';
import { db } from '../../db/database.js';

export const handleReferral = async (ctx: Context) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const botUsername = ctx.me?.username || 'AlphaViperBot';
  const user = db.getUser(userId, ctx.from?.username);
  const refLink = `https://t.me/${botUsername}?start=ref_${userId}`;

  const message = `
🎁 <b>ALPHAVIPER VIRAL REWARDS & AFFILIATE</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
Share AlphaViper with friends and crypto communities to earn free scans and real SOL!

🔗 <b>Your Exclusive Referral Link:</b>
<code>${refLink}</code>
<i>(Tap link above to copy)</i>

📊 <b>YOUR REFERRAL STATS:</b>
• 👥 <b>Invited Friends:</b> ${user.referralCount || 0}
• 🎁 <b>Bonus Free Scans:</b> ${user.bonusScans || 0}
• 💰 <b>Affiliate Earnings:</b> ${(user.referralEarningsSol || 0).toFixed(3)} SOL

💎 <b>HOW REWARDS WORK:</b>
1. <b>Free Bonus Scans:</b> Get <b>+5 Free Scans</b> for every single friend who starts the bot with your link!
2. <b>20% Lifetime SOL Commission:</b> When any friend you invited upgrades to VIP, you get <b>0.02 SOL (~$4)</b> credited to your balance!

🚀 <i>Share your link on Twitter (X), Telegram groups, and WhatsApp to start earning!</i>
━━━━━━━━━━━━━━━━━━━━━━━━━━
  `;

  const shareText = encodeURIComponent(`Protect your Solana trades from rugpulls with AlphaViper AI! 🐍 Scan any token in 2 seconds:\n${refLink}`);
  const keyboard = new InlineKeyboard()
    .url('📤 Share on Telegram', `https://t.me/share/url?url=${refLink}&text=${shareText}`)
    .row()
    .text('🔙 Back to Main Menu', 'action:main_menu');

  await ctx.reply(message.trim(), {
    parse_mode: 'HTML',
    reply_markup: keyboard
  });
};
