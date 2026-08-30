import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/env.js';
import { TokenMarketData } from './dexscreener.service.js';
import { RugCheckResult } from './rugcheck.service.js';
import { MultiDimensionalScoreResult } from './scoring.engine.js';

export interface AiVerdictResult {
  verdictText: string;
  whatLooksGood: string[];
  whatLooksBad: string[];
  whatRequiresAttention: string[];
}

export class AiAnalysisService {
  private static genAI = config.GEMINI_API_KEY ? new GoogleGenerativeAI(config.GEMINI_API_KEY) : null;

  /**
   * Generates a grounded, evidence-based qualitative analysis.
   * STRICT RULE: Gemini explains the deterministic score; it never invents or overrides metrics.
   */
  public static async generateVerdict(
    market: TokenMarketData,
    security: RugCheckResult,
    scoreResult: MultiDimensionalScoreResult
  ): Promise<AiVerdictResult> {
    const goodPoints: string[] = [];
    const badPoints: string[] = [];
    const attentionPoints: string[] = [];

    // Algorithmic Base Extraction from REAL verified data
    if (!security.isMintable && !security.isFreezable) {
      goodPoints.push('Mint & freeze authorities are permanently revoked');
    }
    if (security.isLpLocked && security.lpLockedPct >= 80) {
      goodPoints.push(`${security.lpLockedPct}% of liquidity pool is locked/burned`);
    }
    if (market.buySellRatio24h >= 1.2) {
      goodPoints.push(`Net positive buy pressure (${market.buySellRatio24h}:1 flow)`);
    }

    if (security.isFreezable) {
      badPoints.push('Active freeze authority creates honeypot/blacklist risk');
    }
    if (security.isMintable) {
      badPoints.push('Active mint authority enables infinite token dilution');
    }
    if (market.priceChange24h <= -25) {
      badPoints.push(`Heavy 24h drawdown of ${market.priceChange24h}%`);
    }
    if (market.liquidityUsd < 10000) {
      badPoints.push(`Thin liquidity ($${market.liquidityUsd.toLocaleString()}) creates high slippage`);
    }

    if (security.largestHolderPct > 15) {
      attentionPoints.push(`Top single wallet controls ${security.largestHolderPct}% of supply`);
    }
    if (market.txns24h.buys + market.txns24h.sells < 100) {
      attentionPoints.push('Low 24h trade count indicates sparse organic market depth');
    }
    if (scoreResult.appliedCeilings.length > 0) {
      attentionPoints.push(`Score constrained by: ${scoreResult.appliedCeilings[0].reason}`);
    }

    let verdictText = '';

    // If Gemini is configured, generate clean synthesis
    if (this.genAI && config.GEMINI_API_KEY) {
      try {
        const model = this.genAI.getGenerativeModel({
          model: 'gemini-1.5-flash',
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 150
          }
        });

        const prompt = `
You are AlphaViper AI, a quantitative Solana token risk analyst.
Explain why this token received an Overall Score of ${scoreResult.overallScore}/100 (${scoreResult.overallClassification}).
STRICT RULES:
- Use ONLY the real metrics provided below.
- Do NOT invent numbers, whales, or predict future prices.
- Provide a sharp, 2-to-3 sentence analytical summary.

DATA:
- Symbol: $${market.baseToken.symbol}
- Security Score: ${scoreResult.security.score}/100 (Mint: ${security.isMintable ? 'Enabled' : 'Revoked'}, Freeze: ${security.isFreezable ? 'Enabled' : 'Revoked'}, LP Lock: ${security.lpLockedPct}%)
- Momentum Score: ${scoreResult.momentum.score}/100 (24h: ${market.priceChange24h}%, 1h: ${market.priceChange1h}%, Trajectory: ${scoreResult.momentum.trajectory})
- Liquidity: $${market.liquidityUsd.toLocaleString()} (Slippage: ${scoreResult.liquidity.slippageRisk})
- Holders: Largest ${security.largestHolderPct}%, Top 10: ${security.topHoldersPct}%
- Flow: ${market.buySellRatio24h}:1 (${market.txns24h.buys} buys / ${market.txns24h.sells} sells)
${scoreResult.appliedCeilings.length > 0 ? `- Score Limit Applied: ${scoreResult.appliedCeilings[0].reason}` : ''}

Output ONLY the 2-3 sentence analysis. No greetings.
`;

        const response = await model.generateContent(prompt);
        const text = response.response.text().trim();
        if (text) {
          verdictText = text;
        }
      } catch (err: any) {
        console.warn('Gemini verdict generation note:', err.message);
      }
    }

    if (!verdictText) {
      if (scoreResult.overallScore >= 75) {
        verdictText = `Strong structural setup with revoked contract authorities, $${market.liquidityUsd.toLocaleString()} liquidity, and positive buy flow (${market.buySellRatio24h}:1).`;
      } else if (scoreResult.overallScore >= 45) {
        verdictText = `Standard contract parameters, but moderate liquidity ($${market.liquidityUsd.toLocaleString()}) and ${market.priceChange24h <= 0 ? 'downward' : 'choppy'} momentum suggest disciplined entry sizing.`;
      } else {
        verdictText = `High risk profile driven by ${security.isFreezable || security.isMintable ? 'unrevoked dangerous authorities' : 'heavy price drawdown and elevated sell dominance'}. Caution advised.`;
      }
    }

    return {
      verdictText,
      whatLooksGood: goodPoints.slice(0, 3),
      whatLooksBad: badPoints.slice(0, 3),
      whatRequiresAttention: attentionPoints.slice(0, 3)
    };
  }
}
