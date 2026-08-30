import { Bot } from 'grammy';
import { config } from './config/env.js';
import { db } from './db/database.js';
import { createMainMenuKeyboard } from './bot/menus/main.menu.js';
import { handleScanToken } from './bot/handlers/scan.handler.js';
import { handleTrendingTokens } from './bot/handlers/trending.handler.js';
import { handleTrackWallet, handleUntrackWallet } from './bot/handlers/track.handler.js';
import { handleAlertToken, handleUnalertToken } from './bot/handlers/alert.handler.js';
import { handleWatchToken, handleViewWatchlist, handleUnwatchToken } from './bot/handlers/watchlist.handler.js';
import { handleCompareTokens } from './bot/handlers/compare.handler.js';
import { handleVipInfo, handleVerifyPayment } from './bot/handlers/vip.handler.js';
import { handleAdminStats } from './bot/handlers/admin.handler.js';
import { handleReferral } from './bot/handlers/referral.handler.js';
import { handlePumpRadar } from './bot/handlers/pump.handler.js';
import { WhaleMonitorWorker } from './workers/whale-monitor.worker.js';
import { TokenAlertWorker } from './workers/token-alert.worker.js';
import { RugCheckService } from './services/rugcheck.service.js';

if (!config.BOT_TOKEN) {
  console.log('⚠️ BOT_TOKEN not configured yet in .env');
}

export const bot = new Bot(config.BOT_TOKEN || 'dummy_token');

// Global error handler to guarantee the bot NEVER crashes on expired queries or API blips
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`⚠️ Bot update error [Update #${ctx.update.update_id}]:`, err.error);
});

// Helper for safe callback answering
async function safeAnswer(ctx: any, options?: any) {
  try {
    await ctx.answerCallbackQuery(options);
  } catch (e) {
    // Ignore expired query errors
  }
}

// ==========================================
// BOT COMMANDS
// ==========================================

// /start & Deep Link Routing
bot.command('start', async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const username = ctx.from?.username;
  const user = db.getUser(userId, username);
  const text = ctx.message?.text || '';
  const parts = text.split(' ');

  // Deep Link Routing (e.g. /start ref_123456 or /start scan_DezXAZ...)
  if (parts.length > 1) {
    const payload = parts[1].trim();

    // Referral link
    if (payload.startsWith('ref_')) {
      const referrerId = Number(payload.replace('ref_', ''));
      if (!isNaN(referrerId) && referrerId !== userId) {
        const registered = db.registerReferral(userId, referrerId);
        if (registered) {
          try {
            await bot.api.sendMessage(
              referrerId,
              `🎉 <b>New Referral!</b> A friend just joined using your link!\n🎁 <b>+5 Free Scans</b> have been added to your balance!`,
              { parse_mode: 'HTML' }
            );
          } catch (e) {}
        }
      }
    }
    // Direct scan link
    else if (payload.startsWith('scan_')) {
      const ca = payload.replace('scan_', '');
      await handleScanToken(ctx, ca);
      return;
    }
  }

  const welcomeMessage = `
🐍 <b>WELCOME TO ALPHAVIPER AI</b> ⚡
<i>Your Solana Token Intelligence Terminal inside Telegram.</i>
━━━━━━━━━━━━━━━━━━━━━━━━━━
Discover tokens, evaluate smart contract vulnerabilities, assess liquidity depth, and monitor on-chain flow — all from one interface.

🛡️ <b>Multi-Dimensional Scoring:</b> Independent Security, Momentum, Liquidity, Holders, and Flow metrics.
🔄 <b>Delta Intelligence:</b> Tracks real-time changes between scans.
⚖️ <b>Token Comparison:</b> Compare two tokens head-to-head.
⭐ <b>Personal Watchlist:</b> Save and track your high-conviction plays.
🔔 <b>24/7 Smart Alerts:</b> Early warning for volume spikes & liquidity shifts.
🐋 <b>Wallet Intelligence:</b> On-chain profiling & whale movement alerts.

👇 <b>Core Terminal Commands:</b>
• <code>/scan &lt;CA&gt;</code> — Full multi-dimensional intelligence report
• <code>/compare &lt;CA1&gt; &lt;CA2&gt;</code> — Head-to-head token comparison
• <code>/watch &lt;CA&gt;</code> — Bookmark token to watchlist
• <code>/watchlist</code> — View all monitored tokens
• <code>/alert &lt;CA&gt;</code> — Subscribe to 24/7 breakout alerts
• <code>/trending</code> — Discovery alpha ranked by quality
• <code>/track &lt;Wallet&gt;</code> — Monitor whale wallet activity
• <code>/ref</code> — Earn +5 free scans per invited friend
• <code>/vip</code> — Upgrade to Unlimited VIP terminal access
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

// /watch
bot.command('watch', async (ctx) => {
  await handleWatchToken(ctx);
});

// /watchlist
bot.command('watchlist', async (ctx) => {
  await handleViewWatchlist(ctx);
});

// /unwatch
bot.command('unwatch', async (ctx) => {
  await handleUnwatchToken(ctx);
});

// /compare
bot.command('compare', async (ctx) => {
  await handleCompareTokens(ctx);
});

// /alert & /alerts
bot.command(['alert', 'alerts'], async (ctx) => {
  await handleAlertToken(ctx);
});

// /unalert
bot.command('unalert', async (ctx) => {
  await handleUnalertToken(ctx);
});

// /pump & /pumpfun
bot.command(['pump', 'pumpfun'], async (ctx) => {
  await handlePumpRadar(ctx);
});

// /trending & /alpha
bot.command(['trending', 'alpha'], async (ctx) => {
  await handleTrendingTokens(ctx);
});

// /ref & /referral
bot.command(['ref', 'referral'], async (ctx) => {
  await handleReferral(ctx);
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
  await safeAnswer(ctx);
  await ctx.reply(
    `🔍 Send <code>/scan &lt;Solana_CA&gt;</code> to analyze any token.\n\n<i>Example:</i>\n<code>/scan DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263</code> (BONK)`,
    { parse_mode: 'HTML' }
  );
});

bot.callbackQuery('action:watchlist_view', async (ctx) => {
  await safeAnswer(ctx);
  await handleViewWatchlist(ctx);
});

bot.callbackQuery('action:compare_prompt', async (ctx) => {
  await safeAnswer(ctx);
  await ctx.reply(
    `⚖️ Send <code>/compare &lt;CA1&gt; &lt;CA2&gt;</code> to compare two tokens.\n\n<i>Example:</i>\n<code>/compare DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263 JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN</code>`,
    { parse_mode: 'HTML' }
  );
});

bot.callbackQuery('action:pump_radar', async (ctx) => {
  await safeAnswer(ctx);
  await handlePumpRadar(ctx);
});

bot.callbackQuery('action:referral_info', async (ctx) => {
  await safeAnswer(ctx);
  await handleReferral(ctx);
});

bot.callbackQuery('action:trending', async (ctx) => {
  await safeAnswer(ctx);
  await handleTrendingTokens(ctx);
});

bot.callbackQuery('action:track_prompt', async (ctx) => {
  await safeAnswer(ctx);
  await handleTrackWallet(ctx);
});

bot.callbackQuery('action:vip_info', async (ctx) => {
  await safeAnswer(ctx);
  await handleVipInfo(ctx);
});

bot.callbackQuery('action:verify_prompt', async (ctx) => {
  await safeAnswer(ctx);
  await ctx.reply(
    `💳 Send <code>/verify &lt;Your_Tx_Signature&gt;</code> after sending ${config.VIP_PRICE_SOL} SOL.\n\n` +
    `<i>Example:</i> <code>/verify 4hKx...9ZqP</code>`,
    { parse_mode: 'HTML' }
  );
});

bot.callbackQuery('action:main_menu', async (ctx) => {
  await safeAnswer(ctx);
  const userId = ctx.from?.id;
  const isVip = userId ? db.getUser(userId).isVip : false;

  await ctx.reply(`🐍 <b>AlphaViper AI Main Menu</b>`, {
    parse_mode: 'HTML',
    reply_markup: createMainMenuKeyboard(isVip)
  });
});

// Dynamic Callbacks (Concise prefixes <= 64 bytes)
bot.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery.data;

  // Rescan
  if (data.startsWith('t:rs:')) {
    await safeAnswer(ctx, { text: '⚡ Re-auditing token...' });
    const ca = data.replace('t:rs:', '');
    await handleScanToken(ctx, ca);
  }
  // Scan
  else if (data.startsWith('t:sc:')) {
    await safeAnswer(ctx);
    const ca = data.replace('t:sc:', '');
    await handleScanToken(ctx, ca);
  }
  // Watchlist add
  else if (data.startsWith('t:wt:')) {
    await safeAnswer(ctx, { text: '⭐ Adding to watchlist...' });
    const ca = data.replace('t:wt:', '');
    await handleWatchToken(ctx, ca);
  }
  // Alert
  else if (data.startsWith('t:al:')) {
    await safeAnswer(ctx, { text: '🔔 Setting up token alert...' });
    const ca = data.replace('t:al:', '');
    await handleAlertToken(ctx, ca);
  }
  // Compare prompt for this token
  else if (data.startsWith('t:cp:')) {
    await safeAnswer(ctx);
    const ca = data.replace('t:cp:', '');
    await ctx.reply(
      `⚖️ To compare with another token, send:\n<code>/compare ${ca} &lt;Second_Token_CA&gt;</code>`,
      { parse_mode: 'HTML' }
    );
  }
  // Untrack token alert
  else if (data.startsWith('t:un:')) {
    await safeAnswer(ctx, { text: '🔕 Removing token alert...' });
    const ca = data.replace('t:un:', '');
    const userId = ctx.from?.id;
    if (userId) {
      db.removeTrackedToken(userId, ca);
      await ctx.reply(`✅ Removed <code>${ca}</code> from your token alert watchlist.`, { parse_mode: 'HTML' });
    }
  }
  // Track token creator
  else if (data.startsWith('t:tr:')) {
    await safeAnswer(ctx, { text: '🐋 Finding creator wallet...' });
    const ca = data.replace('t:tr:', '');
    const userId = ctx.from?.id;
    if (userId) {
      const security = await RugCheckService.checkToken(ca);
      const targetWallet = security.creatorAddress;
      if (targetWallet) {
        db.addTrackedWallet(userId, targetWallet, `Creator of ${ca.slice(0, 6)}...`);
        await ctx.reply(`✅ <b>Wallet Added to Watchlist!</b>\n\n📍 <code>${targetWallet}</code>\n🔔 <i>AlphaViper will alert you when this wallet trades!</i>`, { parse_mode: 'HTML' });
      } else {
        await ctx.reply(`⚠️ Could not resolve creator wallet address for this token.`, { parse_mode: 'HTML' });
      }
    }
  }
});

// ==========================================
// SMART MESSAGE PARSER (DMs + GROUP CHATS)
// ==========================================

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim();
  if (text.startsWith('/')) return;

  // Regex to detect Solana base58 contract addresses anywhere in the message
  const solanaCaMatch = text.match(/\b[1-9A-HJ-NP-za-km-z]{32,44}\b/);
  if (solanaCaMatch) {
    const ca = solanaCaMatch[0];
    await handleScanToken(ctx, ca);
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
    TokenAlertWorker.start(bot);

    // Automatically register all terminal commands with Telegram API
    try {
      await bot.api.setMyCommands([
        { command: 'scan', description: '🔍 Deep 6-dimension token audit' },
        { command: 'compare', description: '⚖️ Head-to-head token comparison' },
        { command: 'watch', description: '⭐ Bookmark token to watchlist' },
        { command: 'watchlist', description: '⭐ View all monitored tokens' },
        { command: 'alert', description: '🔔 24/7 breakout & liquidity alerts' },
        { command: 'trending', description: '🔥 Discovery alpha ranked by quality' },
        { command: 'pump', description: '🎯 Pump.fun bonding curve radar' },
        { command: 'track', description: '👛 On-chain wallet intelligence & profiling' },
        { command: 'ref', description: '🎁 Referral link & bonus scan rewards' },
        { command: 'vip', description: '👑 Upgrade to Unlimited VIP (0.1 SOL)' },
        { command: 'admin', description: '📊 Admin metrics & system analytics' }
      ]);
      console.log('✅ Telegram bot commands registered successfully with Telegram API!');
    } catch (cmdErr: any) {
      console.warn('⚠️ Note on registering bot commands:', cmdErr.message);
    }

    await bot.start({
      onStart: (botInfo) => {
        console.log(`✅ AlphaViper Terminal Bot is live as @${botInfo.username}`);
      }
    });
  } catch (err: any) {
    console.error('Failed to start Telegram Bot:', err.message);
  }
}

bootstrap();

