import { Context, InlineKeyboard } from 'grammy';
import { DexScreenerService } from '../../services/dexscreener.service.js';
import { RugCheckService } from '../../services/rugcheck.service.js';
import { ScoringEngine } from '../../services/scoring.engine.js';
import { JupiterService } from '../../services/jupiter.service.js';

export const handleCompareTokens = async (ctx: Context) => {
  const text = ctx.message?.text || '';
  const parts = text.split(' ').filter(p => p.trim().length > 0);

  if (parts.length < 3) {
    const helpMsg = `
⚖️ <b>ALPHAVIPER TOKEN COMPARISON</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
Compare two Solana tokens side-by-side to evaluate which presents the stronger risk-adjusted structure.

<b>Usage:</b>
<code>/compare &lt;CA_Token_1&gt; &lt;CA_Token_2&gt;</code>

<i>Example:</i>
<code>/compare DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263 JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN</code>
━━━━━━━━━━━━━━━━━━━━━━━━━━
    `;
    await ctx.reply(helpMsg.trim(), { parse_mode: 'HTML' });
    return;
  }

  const ca1 = parts[1].trim();
  const ca2 = parts[2].trim();

  const loading = await ctx.reply(`⚖️ <i>Comparing smart contracts, momentum & liquidity for both tokens...</i>`, {
    parse_mode: 'HTML'
  });

  try {
    // 1. Fetch both tokens in parallel
    const [market1, sec1, market2, sec2] = await Promise.all([
      DexScreenerService.getTokenData(ca1),
      RugCheckService.checkToken(ca1),
      DexScreenerService.getTokenData(ca2),
      RugCheckService.checkToken(ca2)
    ]);

    if (!market1) {
      await ctx.api.editMessageText(ctx.chat!.id, loading.message_id, `❌ Token 1 not found on Solana: <code>${ca1}</code>`, { parse_mode: 'HTML' });
      return;
    }
    if (!market2) {
      await ctx.api.editMessageText(ctx.chat!.id, loading.message_id, `❌ Token 2 not found on Solana: <code>${ca2}</code>`, { parse_mode: 'HTML' });
      return;
    }

    const score1 = ScoringEngine.evaluate(market1, sec1);
    const score2 = ScoringEngine.evaluate(market2, sec2);

    // 2. Evaluate Winner
    const token1Better = score1.overallScore >= score2.overallScore;
    const winnerSymbol = token1Better ? market1.baseToken.symbol : market2.baseToken.symbol;
    const winnerScore = token1Better ? score1.overallScore : score2.overallScore;

    const whyBullets: string[] = [];
    if (score1.security.score !== score2.security.score) {
      whyBullets.push(token1Better 
        ? `• Stronger contract security (${score1.security.score}/100 vs ${score2.security.score}/100)`
        : `• Stronger contract security (${score2.security.score}/100 vs ${score1.security.score}/100)`);
    }
    if (score1.liquidity.score !== score2.liquidity.score) {
      whyBullets.push(token1Better
        ? `• Deeper liquidity pool ($${market1.liquidityUsd.toLocaleString()} vs $${market2.liquidityUsd.toLocaleString()})`
        : `• Deeper liquidity pool ($${market2.liquidityUsd.toLocaleString()} vs $${market1.liquidityUsd.toLocaleString()})`);
    }
    if (score1.momentum.score !== score2.momentum.score) {
      whyBullets.push(token1Better
        ? `• Healthier price trajectory (${score1.momentum.trajectory} vs ${score2.momentum.trajectory})`
        : `• Healthier price trajectory (${score2.momentum.trajectory} vs ${score1.momentum.trajectory})`);
    }
    if (score1.flow.score !== score2.flow.score) {
      whyBullets.push(token1Better
        ? `• Stronger buy/sell flow (${market1.buySellRatio24h}:1 vs ${market2.buySellRatio24h}:1)`
        : `• Stronger buy/sell flow (${market2.buySellRatio24h}:1 vs ${market1.buySellRatio24h}:1)`);
    }

    if (whyBullets.length === 0) {
      whyBullets.push('• Comparable structural risk and liquidity profiles across both tokens.');
    }

    const report = `
⚖️ <b>HEAD-TO-HEAD TOKEN COMPARISON</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
<b>Token A:</b> $${market1.baseToken.symbol} | <b>Token B:</b> $${market2.baseToken.symbol}

🎯 <b>OVERALL SCORE:</b>
• <b>$${market1.baseToken.symbol}:</b> <b>${score1.overallScore}/100</b> (${score1.overallBadge})
• <b>$${market2.baseToken.symbol}:</b> <b>${score2.overallScore}/100</b> (${score2.overallBadge})

🛡️ <b>SECURITY SCORE:</b>
• $${market1.baseToken.symbol}: ${score1.security.badge} <b>${score1.security.score}/100</b> (Mint: ${sec1.isMintable ? '🔴' : '🟢'}, Freeze: ${sec1.isFreezable ? '🔴' : '🟢'})
• $${market2.baseToken.symbol}: ${score2.security.badge} <b>${score2.security.score}/100</b> (Mint: ${sec2.isMintable ? '🔴' : '🟢'}, Freeze: ${sec2.isFreezable ? '🔴' : '🟢'})

💧 <b>LIQUIDITY STRUCTURE:</b>
• $${market1.baseToken.symbol}: <b>$${market1.liquidityUsd.toLocaleString()}</b> (${sec1.lpLockedPct}% Lock | ${score1.liquidity.slippageRisk} Slippage)
• $${market2.baseToken.symbol}: <b>$${market2.liquidityUsd.toLocaleString()}</b> (${sec2.lpLockedPct}% Lock | ${score2.liquidity.slippageRisk} Slippage)

📈 <b>MOMENTUM & TRAJECTORY:</b>
• $${market1.baseToken.symbol}: <b>${market1.priceChange24h >= 0 ? '+' : ''}${market1.priceChange24h}%</b> (${score1.momentum.trajectory})
• $${market2.baseToken.symbol}: <b>${market2.priceChange24h >= 0 ? '+' : ''}${market2.priceChange24h}%</b> (${score2.momentum.trajectory})

👥 <b>UNKNOWN HOLDER CONCENTRATION:</b>
• $${market1.baseToken.symbol}: <b>${score1.holders.unknownConcentrationPct}%</b> (Top: ${score1.holders.largestUnknownHolderPct}%)
• $${market2.baseToken.symbol}: <b>${score2.holders.unknownConcentrationPct}%</b> (Top: ${score2.holders.largestUnknownHolderPct}%)

📊 <b>MARKET FLOW (24h):</b>
• $${market1.baseToken.symbol}: <b>${market1.buySellRatio24h}:1</b> ($${market1.volume24h.toLocaleString()} Vol)
• $${market2.baseToken.symbol}: <b>${market2.buySellRatio24h}:1</b> ($${market2.volume24h.toLocaleString()} Vol)
━━━━━━━━━━━━━━━━━━━━━━━━━━
🏆 <b>STRONGER CURRENT STRUCTURE: $${winnerSymbol} (${winnerScore}/100)</b>

<b>WHY?</b>
${whyBullets.join('\n')}

💡 <i>Note: This is a structural risk/reward comparison, not a price prediction.</i>
━━━━━━━━━━━━━━━━━━━━━━━━━━
    `;

    const keyboard = new InlineKeyboard()
      .text(`🔍 Audit $${market1.baseToken.symbol}`, `t:sc:${ca1}`)
      .text(`🔍 Audit $${market2.baseToken.symbol}`, `t:sc:${ca2}`)
      .row()
      .url(`⚡ Buy $${market1.baseToken.symbol}`, JupiterService.getSwapUrl(ca1))
      .url(`⚡ Buy $${market2.baseToken.symbol}`, JupiterService.getSwapUrl(ca2));

    await ctx.api.editMessageText(ctx.chat!.id, loading.message_id, report.trim(), {
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
  } catch (err: any) {
    console.error('Compare error:', err);
    await ctx.api.editMessageText(ctx.chat!.id, loading.message_id, `❌ Error performing token comparison.`, {
      parse_mode: 'HTML'
    });
  }
};
