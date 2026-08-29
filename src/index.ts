import { Bot } from 'grammy';
import { config } from './config/env.js';
import { db } from './db/database.js';
import { createMainMenuKeyboard } from './bot/menus/main.menu.js';
import { handleScanToken } from './bot/handlers/scan.handler.js';
import { handleTrendingTokens } from './bot/handlers/trending.handler.js';
import { handleTrackWallet, handleUntrackWallet } from './bot/handlers/track.handler.js';
import { handleVipInfo, handleVerifyPayment } from './bot/handlers/vip.handler.js';
import { handleAdminStats } from './bot/handlers/admin.handler.js';
import { WhaleMonitorWorker } from './workers/whale-monitor.worker.js';

if (!config.BOT_TOKEN) {
  console.log('⚠️ BOT_TOKEN not configured yet in .env');
  console.log('👉 To run the live Telegram bot:');
  console.log('   1. Message @BotFather on Telegram to create your bot');
  console.log('   2. Add BOT_TOKEN=your_token in .env');
  console.log('   3. Run npm run dev or npm start');
  console.log('\n💡 You can test the scanning & AI engine without a bot token by running:');
  console.log('   npm run test:scan\n');
}

export const bot = new Bot(config.BOT_TOKEN || 'dummy_token');

// ==========================================
// BOT COMMANDS
// ==========================================

// /start
bot.command('start', async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const username = ctx.from?.username;
  const user = db.getUser(userId, username);

  const welcomeMessage = `
🐍 <b>WELCOME TO ALPHAVIPER AI</b> ⚡
━━━━━━━━━━━━━━━━━━━━━━━━━━
Your high-speed Solana AI token auditor, whale tracker, and alpha screener.

🛡️ <b>Instant Rugcheck:</b> Detect freeze/mint risks & LP burn in seconds.
🤖 <b>Gemini AI Alpha Score:</b> Predict momentum before aping.
👛 <b>Whale Watcher:</b> Get alerted when top wallets trade.
⚡ <b>1-Click Buy:</b> Instant Jupiter routing.

👇 <b>Quick Commands:</b>
• <code>/scan &lt;CA&gt;</code> — Deep audit any Solana token
• <code>/trending</code> — Top breakout alpha tokens
• <code>/track &lt;Wallet&gt;</code> — Track a whale wallet
• <code>/vip</code> — Upgrade to Unlimited VIP access
━━━━━━━━━━━━━━━━━━━━━━━━━━
  `;

  await ctx.reply(welcomeMessage.trim(), {
    parse_mode: 'HTML',
    reply_markup: createMainMenuKeyboard(user.isVip)
  });
});

// /scan
bot.command('scan', async (ctx) => {
  await handleScanToken(ctx);
});

// /trending & /alpha
bot.command(['trending', 'alpha'], async (ctx) => {
  await handleTrendingTokens(ctx);
});

// /track
bot.command('track', async (ctx) => {
  await handleTrackWallet(ctx);
});

// /untrack
bot.command('untrack', async (ctx) => {
  await handleUntrackWallet(ctx);
});

// /vip & /subscribe
bot.command(['vip', 'subscribe'], async (ctx) => {
  await handleVipInfo(ctx);
});

// /verify
bot.command('verify', async (ctx) => {
  await handleVerifyPayment(ctx);
});

// /admin
bot.command('admin', async (ctx) => {
  await handleAdminStats(ctx);
});

// ==========================================
// CALLBACK QUERY HANDLERS (INLINE BUTTONS)
// ==========================================

bot.callbackQuery('action:scan_prompt', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    `🔍 Send <code>/scan &lt;Solana_CA&gt;</code> to analyze any token.\n\n<i>Example:</i>\n<code>/scan DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263</code> (BONK)`,
    { parse_mode: 'HTML' }
  );
});

bot.callbackQuery('action:trending', async (ctx) => {
  await ctx.answerCallbackQuery();
  await handleTrendingTokens(ctx);
});

bot.callbackQuery('action:track_prompt', async (ctx) => {
  await ctx.answerCallbackQuery();
  await handleTrackWallet(ctx);
});

bot.callbackQuery('action:vip_info', async (ctx) => {
  await ctx.answerCallbackQuery();
  await handleVipInfo(ctx);
});

bot.callbackQuery('action:verify_prompt', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    `💳 Send <code>/verify &lt;Your_Tx_Signature&gt;</code> after sending ${config.VIP_PRICE_SOL} SOL.\n\n` +
    `<i>Example:</i> <code>/verify 4hKx...9ZqP</code>`,
    { parse_mode: 'HTML' }
  );
});

bot.callbackQuery('action:main_menu', async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from?.id;
  const isVip = userId ? db.getUser(userId).isVip : false;

  await ctx.reply(`🐍 <b>AlphaViper AI Main Menu</b>`, {
    parse_mode: 'HTML',
    reply_markup: createMainMenuKeyboard(isVip)
  });
});

// Rescan dynamic callback
bot.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery.data;

  if (data.startsWith('action:rescan:')) {
    await ctx.answerCallbackQuery({ text: '⚡ Re-auditing token...' });
    const ca = data.replace('action:rescan:', '');
    await handleScanToken(ctx, ca);
  } else if (data.startsWith('action:scan_ca:')) {
    await ctx.answerCallbackQuery();
    const ca = data.replace('action:scan_ca:', '');
    await handleScanToken(ctx, ca);
  }
});

// Auto-scan if user pastes a 32-44 char Solana base58 address directly
bot.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim();
  // If text looks like a Solana address (alphanumeric 32-44 chars) and not a command
  if (!text.startsWith('/') && text.length >= 32 && text.length <= 44 && /^[1-9A-HJ-NP-za-km-z]+$/.test(text)) {
    await handleScanToken(ctx, text);
  }
});

// ==========================================
// START BOT & WORKERS
// ==========================================

async function bootstrap() {
  if (!config.BOT_TOKEN || config.BOT_TOKEN === 'dummy_token') {
    return;
  }

  try {
    console.log('🚀 Starting AlphaViper AI Telegram Bot...');
    WhaleMonitorWorker.start(bot);
    await bot.start({
      onStart: (botInfo) => {
        console.log(`✅ AlphaViper Bot is live as @${botInfo.username}`);
      }
    });
  } catch (err: any) {
    console.error('Failed to start Telegram Bot:', err.message);
  }
}

bootstrap();
