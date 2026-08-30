import { Context, InlineKeyboard } from 'grammy';
import { db, TokenScanSnapshot } from '../../db/database.js';
import { config } from '../../config/env.js';
import { DexScreenerService } from '../../services/dexscreener.service.js';
import { RugCheckService } from '../../services/rugcheck.service.js';
import { ScoringEngine } from '../../services/scoring.engine.js';
import { AiAnalysisService } from '../../services/ai.service.js';
import { createTokenAuditKeyboard } from '../menus/main.menu.js';
import { JupiterService } from '../../services/jupiter.service.js';

export const handleScanToken = async (ctx: Context, customAddress?: string) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const isGroupChat = ctx.chat?.type !== 'private';
  const allowance = db.getDailyAllowance(userId, config.FREE_SCANS_LIMIT);

  // Rate Limiting for Free Tier in DMs
  if (!isGroupChat && !allowance.canScan) {
    await ctx.reply(
      `🎫 <b>DAILY SCANS USED (5/5)</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `You have reached your 5 free scans for today.\n` +
      `📅 <i>Daily allowance resets at 00:00 UTC (Current UTC Date: ${allowance.currentDateUtc}).</i>\n\n` +
      `👑 <b>VIP UNLOCKS:</b>\n` +
      `• ⚡ Unlimited Scans 24/7\n` +
      `• 🔄 Historical Change Detection (What Changed)\n` +
      `• ⭐ Multi-Token Watchlist\n` +
      `• 🚨 24/7 Breakout & Liquidity Smart Alerts\n` +
      `• ⚖️ Head-to-Head Token Comparison\n` +
      `• 👛 On-Chain Wallet Intelligence\n\n` +
      `Upgrade for <b>${config.VIP_PRICE_SOL} SOL</b> (/vip) or invite friends (/ref) for +5 bonus scans!`,
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
      `🔍 <b>How to audit a token:</b>\n\n` +
      `Send: <code>/scan &lt;Solana_Token_Contract_Address&gt;</code>\n\n` +
      `<i>Example:</i> <code>/scan DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263</code> (BONK)`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  let loadingMsg: any = null;
  if (!isGroupChat) {
    loadingMsg = await ctx.reply(`⚡ <i>Auditing smart contract, flow & liquidity for <code>${tokenAddress.slice(0, 8)}...</code></i>`, {
      parse_mode: 'HTML'
    });
  }

  try {
    // 1. Fetch Market & Security Data concurrently for maximum speed
    const [market, security] = await Promise.all([
      DexScreenerService.getTokenData(tokenAddress),
      RugCheckService.checkToken(tokenAddress)
    ]);

    if (!market) {
      const notFoundText = `❌ <b>Token Not Found</b>\nCould not find active Solana liquidity pairs for: <code>${tokenAddress}</code>`;
      if (loadingMsg) {
        await ctx.api.editMessageText(ctx.chat!.id, loadingMsg.message_id, notFoundText, { parse_mode: 'HTML' });
      } else {
        await ctx.reply(notFoundText, { parse_mode: 'HTML' });
      }
      return;
    }

    // 2. Deterministic 6-Dimension Scoring & Risk Engine
    const scoreResult = ScoringEngine.evaluate(market, security);

    // 3. Grounded AI Verdict Engine (Gemini strictly explains score)
    const aiVerdict = await AiAnalysisService.generateVerdict(market, security, scoreResult);

    // 4. Save Scan Snapshot & Extract Delta Intelligence
    const currentSnapshot: TokenScanSnapshot = {
      tokenAddress: market.baseToken.address,
      symbol: market.baseToken.symbol,
      priceUsd: market.priceUsd,
      liquidityUsd: market.liquidityUsd,
      volume24h: market.volume24h,
      topHoldersPct: security.unknownConcentrationPct || security.topHoldersPct,
      largestHolderPct: security.largestUnknownHolderPct || security.largestHolderPct,
      buySellRatio24h: market.buySellRatio24h,
      priceChange24h: market.priceChange24h,
      overallScore: scoreResult.overallScore,
      scannedAt: Date.now()
    };

    const deltaChange = db.saveScanSnapshot(currentSnapshot);

    // Increment user scan count
    db.incrementScan(userId);
    const updatedAllowance = db.getDailyAllowance(userId, config.FREE_SCANS_LIMIT);

    // Indicators formatting
    const change5mStr = market.priceChange5m >= 0 ? `+${market.priceChange5m}% 🟢` : `${market.priceChange5m}% 🔴`;
    const change1hStr = market.priceChange1h >= 0 ? `+${market.priceChange1h}% 🟢` : `${market.priceChange1h}% 🔴`;
    const change6hStr = market.priceChange6h >= 0 ? `+${market.priceChange6h}% 🟢` : `${market.priceChange6h}% 🔴`;
    const change24hStr = market.priceChange24h >= 0 ? `+${market.priceChange24h}% 🟢` : `${market.priceChange24h}% 🔴`;

    // Group chat compact preview
    if (isGroupChat) {
      const groupMsg = `
🐍 <b>$${market.baseToken.symbol}</b> (<code>${market.baseToken.name}</code>)
💰 Price: $${market.priceUsd} | 💧 Liq: $${market.liquidityUsd.toLocaleString()} | 24h: ${change24hStr}

🎯 <b>SCORE: ${scoreResult.overallScore}/100</b> (${scoreResult.overallBadge})
• Security: ${scoreResult.security.badge} ${scoreResult.security.score}/100 | Momentum: ${scoreResult.momentum.badge} ${scoreResult.momentum.trajectory}
• Liquidity: ${scoreResult.liquidity.badge} ${scoreResult.liquidity.score}/100 | Holders: ${scoreResult.holders.badge} ${scoreResult.holders.score}/100
      `;

      const botUsername = ctx.me?.username || 'Alphavipersolbot';
      const groupKeyboard = new InlineKeyboard()
        .url('⚡ Buy on Jupiter', JupiterService.getSwapUrl(market.baseToken.address))
        .url('📊 Chart', market.url)
        .row()
        .url('🔍 Full Deep Audit', `https://t.me/${botUsername}?start=scan_${market.baseToken.address}`);

      await ctx.reply(groupMsg.trim(), { parse_mode: 'HTML', reply_markup: groupKeyboard });
      return;
    }

    // ==========================================
    // FULL TERMINAL INTELLIGENCE REPORT (DMs)
    // ==========================================
    const remainingScans = updatedAllowance.isVip 
      ? '👑 VIP (Unlimited)' 
      : `${updatedAllowance.scansRemaining} left today (UTC)`;

    // Delta Change Section (Only if meaningful changes exist)
    let deltaSection = '';
    if (deltaChange && (Math.abs(deltaChange.scoreDiff) >= 1 || Math.abs(deltaChange.priceDiffPct) >= 1)) {
      deltaSection = `
🔄 <b>WHAT CHANGED? (vs scan ${deltaChange.timeDiffFormatted})</b>
• <b>Price:</b> ${deltaChange.priceFormatted}
• <b>Liquidity:</b> ${deltaChange.liquidityFormatted}
• <b>Top 10:</b> ${deltaChange.topHoldersFormatted} | <b>Flow:</b> ${deltaChange.flowFormatted}
• <b>Score:</b> <b>${deltaChange.scoreFormatted}</b>
💡 <i>${deltaChange.interpretation}</i>
━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
    }

    // Notable Opportunity Signals
    let oppSignalsText = '';
    if (scoreResult.opportunitySignals.length > 0) {
      oppSignalsText = `\n⚡ <b>NOTABLE SIGNALS:</b>\n`;
      scoreResult.opportunitySignals.forEach(sig => {
        oppSignalsText += `• <b>${sig.tag}:</b> <i>${sig.description}</i>\n`;
      });
      oppSignalsText += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    }

    // Positive Drivers
    let posText = '';
    scoreResult.positiveDrivers.slice(0, 3).forEach(d => {
      posText += `  🟢 ${d}\n`;
    });
    if (!posText) posText = '  • Baseline market structure\n';

    // Risk Drivers
    let riskDriversText = '';
    scoreResult.riskDrivers.slice(0, 3).forEach(d => {
      riskDriversText += `  🔴 ${d}\n`;
    });
    if (!riskDriversText) riskDriversText = '  • No severe structural penalties\n';

    // Key Risks Ranked
    let rankedRisksText = '';
    scoreResult.rankedRisks.slice(0, 3).forEach((r, idx) => {
      rankedRisksText += `${idx + 1}. ${r}\n`;
    });

    // Investigate Next Actions
    let investigateText = '';
    scoreResult.investigateNext.slice(0, 3).forEach((act, idx) => {
      investigateText += `${idx + 1}. ${act}\n`;
    });

    // Takeaways
    let takeawaysText = '';
    scoreResult.takeawayBullets.forEach(t => {
      takeawaysText += `• ${t}\n`;
    });

    const reportMessage = `
🐍 <b>ALPHAVIPER INTELLIGENCE REPORT</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
<b>$${market.baseToken.symbol}</b> (<code>${market.baseToken.name}</code>)
<b>DEX:</b> ${market.dexId.toUpperCase()} | <b>AGE:</b> ${market.pairAgeFormatted}

🎯 <b>OVERALL SCORE: ${scoreResult.overallScore}/100</b>
${scoreResult.overallBadge}
📊 <b>DATA CONFIDENCE:</b> <b>${scoreResult.dataConfidence}</b> (<i>${scoreResult.confidenceReason}</i>)
━━━━━━━━━━━━━━━━━━━━━━━━━━${deltaSection}${oppSignalsText}
🛡️ <b>SECURITY: ${scoreResult.security.badge} ${scoreResult.security.score}/100 (${scoreResult.security.rating})</b>
• Mint Authority: <b>${security.isMintable ? '🔴 Active (Dilution Risk)' : '🟢 Revoked'}</b>
• Freeze Authority: <b>${security.isFreezable ? '🔴 Active (Honeypot Risk)' : '🟢 Revoked'}</b>
• LP Protection: <b>${security.lpLockedPct}% Locked/Burned</b> (${security.isLpLocked ? '🟢 Locked' : '🔴 Unlocked'})
• Metadata: <b>${security.isMutable ? '🟡 Mutable' : '🟢 Immutable'}</b>

📈 <b>MARKET MOMENTUM: ${scoreResult.momentum.badge} ${scoreResult.momentum.score}/100 (${scoreResult.momentum.rating})</b>
• <b>5m:</b> ${change5mStr} | <b>1h:</b> ${change1hStr} | <b>6h:</b> ${change6hStr} | <b>24h:</b> ${change24hStr}
• Trajectory: <b>${scoreResult.momentum.trajectory}</b>${scoreResult.momentum.divergenceNote ? `\n• <i>⚠️ ${scoreResult.momentum.divergenceNote}</i>` : ''}

💧 <b>LIQUIDITY: ${scoreResult.liquidity.badge} ${scoreResult.liquidity.score}/100 (${scoreResult.liquidity.rating})</b>
• Pool Size: <b>$${market.liquidityUsd.toLocaleString()}</b> (<b>${scoreResult.liquidity.liquiditySizeTier}</b>)
• Liq / MC: <b>${scoreResult.liquidity.liqToMcRatio}%</b> | Liq / FDV: <b>${scoreResult.liquidity.liqToFdvRatio}%</b>
• Slippage Risk: <b>${scoreResult.liquidity.slippageRisk}</b> | Vol/Liq Velocity: <b>${scoreResult.liquidity.volToLiqVelocity}x</b>

👥 <b>HOLDER INTELLIGENCE: ${scoreResult.holders.badge} ${scoreResult.holders.score}/100 (${scoreResult.holders.rating})</b>
• Largest Unknown Wallet: <b>${scoreResult.holders.largestUnknownHolderPct}%</b>
• Top 10 Unknown Concentration: <b>${scoreResult.holders.unknownConcentrationPct}%</b>
• Known LP/Protocol Share: <b>${scoreResult.holders.knownConcentrationPct}%</b>

📊 <b>MARKET FLOW: ${scoreResult.flow.badge} ${scoreResult.flow.score}/100 (${scoreResult.flow.rating})</b>
• 24h Flow: <b>${market.txns24h.buys.toLocaleString()} Buys / ${market.txns24h.sells.toLocaleString()} Sells</b> (<b>${market.buySellRatio24h}:1</b>)
• 24h Volume: <b>$${market.volume24h.toLocaleString()}</b> | Market Cap: <b>$${market.marketCap.toLocaleString()}</b>
• Flow State: <b>${scoreResult.flow.flowInterpretation.replace(/_/g, ' ')}</b>

🐋 <b>SMART MONEY:</b>
⚪ <i>Smart-money data unavailable. Tracking requires on-chain verified clustering.</i>
━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ <b>RISK PROFILE:</b>
• Contract: <b>${scoreResult.riskProfile.contract}</b> | Liquidity: <b>${scoreResult.riskProfile.liquidity}</b>
• Momentum: <b>${scoreResult.riskProfile.momentum}</b> | Concentration: <b>${scoreResult.riskProfile.concentration}</b>
• Flow: <b>${scoreResult.riskProfile.flow}</b> | Smart Money: <b>${scoreResult.riskProfile.smartMoney}</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 <b>WHY THIS SCORE?</b>
<b>Positive Drivers:</b>
${posText.trimEnd()}
<b>Risk Drivers:</b>
${riskDriversText.trimEnd()}

🧠 <b>ALPHAVIPER VERDICT:</b>
<i>"${aiVerdict.verdictText}"</i>

⚠️ <b>KEY RISKS:</b>
${rankedRisksText.trimEnd()}

🔎 <b>INVESTIGATE NEXT:</b>
${investigateText.trimEnd()}

🎯 <b>ALPHAVIPER TAKEAWAY:</b>
${takeawaysText.trimEnd()}
━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 <b>CA:</b> <code>${market.baseToken.address}</code>
🎫 <b>Scans:</b> ${remainingScans}
    `;

    const keyboard = createTokenAuditKeyboard(market.baseToken.address, market.url);

    if (loadingMsg) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        reportMessage.trim(),
        {
          parse_mode: 'HTML',
          reply_markup: keyboard
        }
      );
    } else {
      await ctx.reply(reportMessage.trim(), {
        parse_mode: 'HTML',
        reply_markup: keyboard
      });
    }
  } catch (err: any) {
    console.error('Scan error:', err);
    const errorText = `❌ <b>Scan Failed</b>\nAn error occurred while auditing the token. Please try again in a few seconds.`;
    if (loadingMsg) {
      await ctx.api.editMessageText(ctx.chat!.id, loadingMsg.message_id, errorText, { parse_mode: 'HTML' });
    } else {
      await ctx.reply(errorText, { parse_mode: 'HTML' });
    }
  }
};
