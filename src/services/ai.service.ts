import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/env.js';
import { TokenMarketData } from './dexscreener.service.js';
import { RugCheckResult } from './rugcheck.service.js';

export interface AiAnalysisResult {
  alphaScore: number; // 0 to 100
  verdict: 'STRONG_BUY' | 'HIGH_MOMENTUM' | 'DEGEN_WATCH' | 'HIGH_RISK_AVOID' | 'POTENTIAL_RUG';
  badge: string; // e.g. "🟢 Strong Momentum"
  summary: string;
  keyPoints: string[];
}

export class AiAnalysisService {
  private static genAI = config.GEMINI_API_KEY ? new GoogleGenerativeAI(config.GEMINI_API_KEY) : null;

  public static async analyzeToken(
    market: TokenMarketData,
    security: RugCheckResult
  ): Promise<AiAnalysisResult> {
    // If Gemini key is available, generate dynamic AI reasoning
    if (this.genAI && config.GEMINI_API_KEY) {
      try {
        const model = this.genAI.getGenerativeModel({
          model: 'gemini-1.5-flash',
          generationConfig: {
            responseMimeType: 'application/json'
          }
        });

        const prompt = `
You are AlphaViper AI, an elite crypto degen analyst and smart contract auditor on Solana.
Analyze this token and provide a punchy, ultra-concise 2-sentence summary and alpha score for Telegram traders.

TOKEN DATA:
- Symbol: ${market.baseToken.symbol} (${market.baseToken.name})
- Price: $${market.priceUsd}
- Liquidity: $${market.liquidityUsd.toLocaleString()}
- Market Cap / FDV: $${market.fdv.toLocaleString()}
- 24h Volume: $${market.volume24h.toLocaleString()}
- 5m Change: ${market.priceChange5m}% | 1h Change: ${market.priceChange1h}% | 24h Change: ${market.priceChange24h}%
- 24h Buys/Sells: ${market.txns24h.buys} buys / ${market.txns24h.sells} sells

SECURITY CHECK:
- Mint Authority: ${security.isMintable ? 'DANGER: Mintable (Can dump)' : 'Revoked / Safe'}
- Freeze Authority: ${security.isFreezable ? 'DANGER: Freezable (Honeypot risk)' : 'Revoked / Safe'}
- LP Locked: ${security.isLpLocked ? `${security.lpLockedPct}% Locked` : 'DANGER: Unlocked LP'}
- Top 10 Holders: ${security.topHoldersPct}%

Respond ONLY with valid JSON in this exact structure:
{
  "alphaScore": <number between 0 and 100>,
  "verdict": "STRONG_BUY" | "HIGH_MOMENTUM" | "DEGEN_WATCH" | "HIGH_RISK_AVOID" | "POTENTIAL_RUG",
  "badge": "<emoji + short title, e.g. 🟢 Strong Momentum | 🟡 Degen Play | 🔴 Extreme Risk>",
  "summary": "<2 punchy sentences highlighting momentum and risk>",
  "keyPoints": ["<point 1>", "<point 2>"]
}
`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        if (text) {
          const parsed = JSON.parse(text);
          return {
            alphaScore: Math.min(100, Math.max(0, Number(parsed.alphaScore || 50))),
            verdict: parsed.verdict || 'DEGEN_WATCH',
            badge: parsed.badge || '🟢 Active Token',
            summary: parsed.summary || 'Solid liquidity and active trading volume.',
            keyPoints: parsed.keyPoints || []
          };
        }
      } catch (err: any) {
        console.warn('Gemini AI generation fallback:', err.message);
      }
    }

    // Algorithmic Fallback Engine (Runs even with 0 API keys)
    let score = 70;
    let badge = '🟢 Healthy Momentum';
    let verdict: AiAnalysisResult['verdict'] = 'HIGH_MOMENTUM';

    if (security.isFreezable || security.isMintable) {
      score = 15;
      badge = '🔴 DANGER: Honeypot / Mintable';
      verdict = 'POTENTIAL_RUG';
    } else if (market.liquidityUsd < 5000) {
      score = 35;
      badge = '🔴 Micro Liquidity Alert';
      verdict = 'HIGH_RISK_AVOID';
    } else if (security.topHoldersPct > 40) {
      score = 45;
      badge = '🟡 High Whale Concentration';
      verdict = 'DEGEN_WATCH';
    } else if (market.priceChange1h > 25 && market.volume24h > 50000) {
      score = 88;
      badge = '🚀 Explosive Breakout';
      verdict = 'STRONG_BUY';
    }

    const buyRatio = market.txns24h.sells > 0 ? (market.txns24h.buys / market.txns24h.sells).toFixed(1) : '1.0';

    return {
      alphaScore: score,
      verdict,
      badge,
      summary: `Clean contract with ${security.isFreezable ? 'active freeze risk' : 'revoked authorities'}. Buy/sell ratio at ${buyRatio}:1 with $${market.liquidityUsd.toLocaleString()} liquidity.`,
      keyPoints: [
        `Top 10 holders control ${security.topHoldersPct}%`,
        `24h volume at $${market.volume24h.toLocaleString()}`
      ]
    };
  }
}
