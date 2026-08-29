import { Context } from 'grammy';
import { db } from '../../db/database.js';
import { config } from '../../config/env.js';
import { DexScreenerService } from '../../services/dexscreener.service.js';
import { RugCheckService } from '../../services/rugcheck.service.js';
import { AiAnalysisService } from '../../services/ai.service.js';
import { createTokenAuditKeyboard } from '../menus/main.menu.js';

export const handleScanToken = async (ctx: Context, customAddress?: string) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const username = ctx.from?.username;
  const user = db.getUser(userId, username);

  // Check Rate Limiting for Free Tier
  if (!user.isVip && user.dailyScansCount >= config.FREE_SCANS_LIMIT) {
    await ctx.reply(
      `🔒 <b>Daily Scan Limit Reached (${config.FREE_SCANS_LIMIT}/${config.FREE_SCANS_LIMIT})</b>\n\n` +
      `Free users get ${config.FREE_SCANS_LIMIT} token scans per day.\n\n` +
      `👑 Upgrade to <b>VIP Tier</b> for unlimited scans, instant whale tracking, and automated alpha alerts!\n\n` +
      `Type <b>/vip</b> to unlock instant 30-day VIP access for <b>${config.VIP_PRICE_SOL} SOL</b>.`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  // Extract Token Address
  let tokenAddress = customAddress;
  if (!tokenAddress) {
    const text = ctx.message?.text || '';
    const parts = text.split(' ');
    if (parts.length > 1) {
      tokenAddress = parts[1].trim();
    }
  }

  if (!tokenAddress) {
    await ctx.reply(
      `🔍 <b>How to scan a token:</b>\n\n` +
      `Send: <code>/scan &lt;Solana_Token_Contract_Address&gt;</code>\n\n` +
      `<i>Example:</i> <code>/scan DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263</code> (BONK)`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  const loadingMsg = await ctx.reply(`⚡ <i>Auditing smart contract & fetching real-time liquidity for <code>${tokenAddress.slice(0, 8)}...</code></i>`, {
    parse_mode: 'HTML'
  });

  try {
    // 1. Fetch Market Data
    const market = await DexScreenerService.getTokenData(tokenAddress);
    if (!market) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        `❌ <b>Token Not Found</b>\n\n` +
        `Could not find active Solana liquidity pairs for: <code>${tokenAddress}</code>\n` +
        `Please verify the contract address and try again.`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    // 2. Fetch Contract Security
    const security = await RugCheckService.checkToken(tokenAddress);

    // 3. Run Gemini AI Alpha & Momentum Engine
    const aiAnalysis = await AiAnalysisService.analyzeToken(market, security);

    // Increment scan count for user
    db.incrementScan(userId);
    const updatedUser = db.getUser(userId);

    // Badges & Formatting
    const mintBadge = security.isMintable ? '🔴 Mintable (Danger)' : '🟢 Revoked';
    const freezeBadge = security.isFreezable ? '🔴 Freezable (Honeypot)' : '🟢 Revoked';
    const lpBadge = security.isLpLocked ? `🟢 ${security.lpLockedPct}% Locked/Burned` : '🔴 Unlocked (High Risk)';
    const topHoldersBadge = security.topHoldersPct > 35 ? `🟡 ${security.topHoldersPct}% (Concentrated)` : `🟢 ${security.topHoldersPct}% (Healthy)`;

    const change5mStr = market.priceChange5m >= 0 ? `+${market.priceChange5m}% 🟢` : `${market.priceChange5m}% 🔴`;
    const change1hStr = market.priceChange1h >= 0 ? `+${market.priceChange1h}% 🟢` : `${market.priceChange1h}% 🔴`;
    const change24hStr = market.priceChange24h >= 0 ? `+${market.priceChange24h}% 🟢` : `${market.priceChange24h}% 🔴`;

    const remainingScans = updatedUser.isVip ? '👑 VIP (Unlimited)' : `${Math.max(0, config.FREE_SCANS_LIMIT - updatedUser.dailyScansCount)} left today`;

    const reportMessage = `
🐍 <b>ALPHAVIPER AUDIT REPORT</b> — <b>$${market.baseToken.symbol}</b>
<code>${market.baseToken.name}</code> | <i>${market.dexId.toUpperCase()}</i>
━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 <b>Price:</b> $${market.priceUsd}
💧 <b>Liquidity:</b> $${market.liquidityUsd.toLocaleString()}
💎 <b>Market Cap:</b> $${market.marketCap.toLocaleString()}
📊 <b>24h Volume:</b> $${market.volume24h.toLocaleString()}

📈 <b>Momentum:</b> 5m: ${change5mStr} | 1h: ${change1hStr} | 24h: ${change24hStr}
👥 <b>24h Txns:</b> ${market.txns24h.buys} Buys / ${market.txns24h.sells} Sells

🛡️ <b>CONTRACT SECURITY AUDIT:</b>
• Mint Authority: <b>${mintBadge}</b>
• Freeze Authority: <b>${freezeBadge}</b>
• LP Status: <b>${lpBadge}</b>
• Top 10 Holders: <b>${topHoldersBadge}</b>

🤖 <b>GEMINI AI ALPHA SCORE: ${aiAnalysis.alphaScore}/100</b>
${aiAnalysis.badge}
<i>"${aiAnalysis.summary}"</i>
━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 <b>CA:</b> <code>${market.baseToken.address}</code>
🎫 <b>Scans:</b> ${remainingScans}
    `;

    const keyboard = createTokenAuditKeyboard(market.baseToken.address, market.url);

    await ctx.api.editMessageText(
      ctx.chat!.id,
      loadingMsg.message_id,
      reportMessage.trim(),
      {
        parse_mode: 'HTML',
        reply_markup: keyboard
      }
    );
  } catch (err: any) {
    console.error('Scan error:', err);
    await ctx.api.editMessageText(
      ctx.chat!.id,
      loadingMsg.message_id,
      `❌ <b>Scan Failed</b>\nAn error occurred while auditing the token. Please try again in a few seconds.`,
      { parse_mode: 'HTML' }
    );
  }
};
