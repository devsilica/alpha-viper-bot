import { TokenMarketData } from './dexscreener.service.js';
import { RugCheckResult } from './rugcheck.service.js';

export type MomentumTrajectory = 'ACCELERATING' | 'IMPROVING' | 'STABLE' | 'WEAKENING' | 'DETERIORATING';
export type DataConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';
export type RiskLevel = '🟢 LOW' | '🟡 MEDIUM' | '🟠 HIGH' | '🔴 CRITICAL' | '⚪ UNKNOWN';

export interface DimensionScore {
  score: number; // 0 to 100
  rating: 'EXCELLENT' | 'GOOD' | 'MODERATE' | 'POOR' | 'CRITICAL';
  badge: '🟢' | '🟡' | '🔴';
  summary: string;
  keyFactors: string[];
}

export interface ScoreCeilingRule {
  ruleName: string;
  reason: string;
  maxScoreAllowed: number;
}

export interface TokenOpportunitySignal {
  type: 'BULLISH' | 'BEARISH' | 'WARNING' | 'NEUTRAL';
  tag: string;
  description: string;
}

export interface RiskProfile {
  contract: RiskLevel;
  liquidity: RiskLevel;
  momentum: RiskLevel;
  concentration: RiskLevel;
  flow: RiskLevel;
  smartMoney: RiskLevel;
}

export interface MultiDimensionalScoreResult {
  overallScore: number; // 0 to 100
  overallClassification: 'STRONG_ALPHA' | 'HEALTHY_SETUP' | 'CAUTION_DEGEN' | 'HIGH_RISK_AVOID' | 'CRITICAL_DANGER';
  overallBadge: string;
  dataConfidence: DataConfidenceLevel;
  confidenceReason: string;

  security: DimensionScore;
  momentum: DimensionScore & { trajectory: MomentumTrajectory; divergenceNote?: string };
  liquidity: DimensionScore & { 
    liquiditySizeTier: 'DEEP' | 'MODERATE' | 'THIN' | 'EXTREMELY_THIN';
    liqToMcRatio: number;
    liqToFdvRatio: number;
    volToLiqVelocity: number;
    slippageRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  };
  holders: DimensionScore & { 
    knownConcentrationPct: number;
    unknownConcentrationPct: number;
    largestUnknownHolderPct: number;
    concentrationAssessment: string;
  };
  flow: DimensionScore & { flowInterpretation: string };
  smartMoney?: DimensionScore;

  riskProfile: RiskProfile;
  positiveDrivers: string[];
  riskDrivers: string[];
  appliedCeilings: ScoreCeilingRule[];
  opportunitySignals: TokenOpportunitySignal[];
  rankedRisks: string[];
  investigateNext: string[];
  takeawayBullets: string[];
}

export class ScoringEngine {
  public static evaluate(
    market: TokenMarketData,
    security: RugCheckResult,
    hasSmartMoneyData: boolean = false,
    smartMoneyScoreVal?: number
  ): MultiDimensionalScoreResult {
    const positiveDrivers: string[] = [];
    const riskDrivers: string[] = [];
    const appliedCeilings: ScoreCeilingRule[] = [];
    const opportunitySignals: TokenOpportunitySignal[] = [];
    const rankedRisks: string[] = [];
    const investigateNext: string[] = [];
    const takeawayBullets: string[] = [];

    // =========================================================================
    // 1. SECURITY SCORE (0 - 100)
    // =========================================================================
    let secScore = 100;
    const secFactors: string[] = [];
    let contractRisk: RiskLevel = '🟢 LOW';

    if (security.isFreezable) {
      secScore -= 50;
      contractRisk = '🔴 CRITICAL';
      secFactors.push('Freeze authority is ACTIVE (Honeypot risk)');
      riskDrivers.push('Active Freeze Authority: Creator can blacklist wallets');
      rankedRisks.push('Freeze authority is enabled: Creator has the technical ability to block selling.');
      investigateNext.push('Verify if creator wallet has executed blacklist/freeze commands.');
    } else {
      secFactors.push('Freeze authority permanently revoked');
      positiveDrivers.push('Freeze Authority Revoked: Unrestricted trading');
    }

    if (security.isMintable) {
      secScore -= 35;
      if (contractRisk !== '🔴 CRITICAL') contractRisk = '🟠 HIGH';
      secFactors.push('Mint authority is ACTIVE (Inflation risk)');
      riskDrivers.push('Active Mint Authority: Creator can print unlimited tokens');
      rankedRisks.push('Mint authority is enabled: Token supply can be diluted to $0.');
      investigateNext.push('Check creator wallet balance and past mint transactions on Solscan.');
    } else {
      secFactors.push('Mint authority permanently revoked');
      positiveDrivers.push('Mint Authority Revoked: Total supply is fixed');
    }

    if (security.isMutable) {
      secScore -= 10;
      if (contractRisk === '🟢 LOW') contractRisk = '🟡 MEDIUM';
      secFactors.push('Token metadata is mutable');
      riskDrivers.push('Mutable Metadata: Token name, image, or symbol can be altered');
    } else {
      secFactors.push('Immutable metadata');
    }

    if (security.lpLockedPct < 50) {
      secScore -= 25;
      secFactors.push(`Liquidity pool only ${security.lpLockedPct}% locked`);
      riskDrivers.push(`Low LP Lock (${security.lpLockedPct}%): High liquidity pull risk`);
    } else if (security.lpLockedPct >= 85) {
      positiveDrivers.push(`LP Protection: ${security.lpLockedPct}% locked/burned`);
    }

    secScore = Math.max(0, Math.min(100, secScore));
    const secRating = secScore >= 80 ? 'EXCELLENT' : secScore >= 60 ? 'GOOD' : secScore >= 40 ? 'MODERATE' : 'CRITICAL';
    const secBadge = secScore >= 75 ? '🟢' : secScore >= 50 ? '🟡' : '🔴';

    // =========================================================================
    // 2. MARKET MOMENTUM SCORE (0 - 100)
    // =========================================================================
    let momScore = 50;
    const momFactors: string[] = [];
    let momentumRisk: RiskLevel = '🟢 LOW';

    // Trajectory Classification: ACCELERATING, IMPROVING, STABLE, WEAKENING, DETERIORATING
    let trajectory: MomentumTrajectory = 'STABLE';
    let divergenceNote: string | undefined = undefined;

    if (market.priceChange5m > 3 && market.priceChange1h > 12) {
      trajectory = 'ACCELERATING';
      momentumRisk = '🟢 LOW';
      opportunitySignals.push({
        type: 'BULLISH',
        tag: '🚀 MOMENTUM ACCELERATING',
        description: `Rapid upside expansion (+${market.priceChange5m}% 5m, +${market.priceChange1h}% 1h).`
      });
    } else if (market.priceChange1h > 5 && market.priceChange24h > 10) {
      trajectory = 'IMPROVING';
      momentumRisk = '🟢 LOW';
    } else if (market.priceChange1h < -8 || (market.priceChange5m < -3 && market.priceChange1h < 0)) {
      trajectory = 'DETERIORATING';
      momentumRisk = '🔴 CRITICAL';
      opportunitySignals.push({
        type: 'BEARISH',
        tag: '⚠️ MOMENTUM DETERIORATING',
        description: `Short-term selling pressure accelerating (${market.priceChange1h}% in 1h).`
      });
      investigateNext.push('Watch whether 5m/1h momentum stabilizes before considering entry.');
    } else if (market.priceChange1h < -3 || market.priceChange24h < -10) {
      trajectory = 'WEAKENING';
      momentumRisk = '🟠 HIGH';
    } else {
      trajectory = 'STABLE';
      momentumRisk = '🟡 MEDIUM';
    }

    // Divergence detection: Price rising while buy/sell flow or liquidity is deteriorating
    if (market.priceChange24h > 15 && market.buySellRatio24h < 0.85) {
      divergenceNote = 'Bearish Divergence: Price is elevated (+24h), but sellers are dominating transaction flow.';
      riskDrivers.push('Bearish Flow Divergence: Price rising on declining buy volume');
    }

    // Momentum Points
    if (market.priceChange24h >= 50) {
      momScore += 25;
      momFactors.push(`Strong 24h expansion (+${market.priceChange24h}%)`);
      positiveDrivers.push(`Strong 24h Trend: +${market.priceChange24h}%`);
    } else if (market.priceChange24h >= 15) {
      momScore += 15;
      momFactors.push(`Healthy 24h gain (+${market.priceChange24h}%)`);
      positiveDrivers.push(`Positive Trend: +${market.priceChange24h}% (24h)`);
    } else if (market.priceChange24h <= -50) {
      momScore -= 40;
      momentumRisk = '🔴 CRITICAL';
      momFactors.push(`Severe 24h collapse (${market.priceChange24h}%)`);
      riskDrivers.push(`Catastrophic Drawdown: ${market.priceChange24h}% (24h)`);
      rankedRisks.push(`Severe price crash (${market.priceChange24h}%): Heavy overhead supply and distribution.`);
    } else if (market.priceChange24h <= -20) {
      momScore -= 20;
      if (momentumRisk !== '🔴 CRITICAL') momentumRisk = '🟠 HIGH';
      momFactors.push(`Notable 24h decline (${market.priceChange24h}%)`);
      riskDrivers.push(`Downward Trend: ${market.priceChange24h}%`);
    }

    momScore = Math.max(5, Math.min(100, momScore));
    const momRating = momScore >= 75 ? 'EXCELLENT' : momScore >= 55 ? 'GOOD' : momScore >= 35 ? 'MODERATE' : 'POOR';
    const momBadge = momScore >= 65 ? '🟢' : momScore >= 40 ? '🟡' : '🔴';

    // =========================================================================
    // 3. LIQUIDITY SCORE (0 - 100)
    // =========================================================================
    let liqScore = 50;
    const liqFactors: string[] = [];
    let liquidityRisk: RiskLevel = '🟢 LOW';
    let liquiditySizeTier: 'DEEP' | 'MODERATE' | 'THIN' | 'EXTREMELY_THIN' = 'MODERATE';
    let slippageRisk: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';

    if (market.liquidityUsd >= 100000) {
      liqScore += 30;
      liquiditySizeTier = 'DEEP';
      slippageRisk = 'LOW';
      liquidityRisk = '🟢 LOW';
      liqFactors.push(`Deep pool ($${market.liquidityUsd.toLocaleString()})`);
      positiveDrivers.push(`Deep Liquidity: $${market.liquidityUsd.toLocaleString()} in pool`);
    } else if (market.liquidityUsd >= 30000) {
      liqScore += 15;
      liquiditySizeTier = 'MODERATE';
      slippageRisk = 'LOW';
      liquidityRisk = '🟢 LOW';
      liqFactors.push(`Adequate pool ($${market.liquidityUsd.toLocaleString()})`);
    } else if (market.liquidityUsd < 8000) {
      liqScore -= 35;
      liquiditySizeTier = 'EXTREMELY_THIN';
      slippageRisk = 'HIGH';
      liquidityRisk = '🔴 CRITICAL';
      liqFactors.push(`Extremely thin liquidity ($${market.liquidityUsd.toLocaleString()})`);
      riskDrivers.push(`Extremely Thin Pool ($${market.liquidityUsd.toLocaleString()}): Extreme price volatility`);
      rankedRisks.push(`Extremely thin liquidity ($${market.liquidityUsd.toLocaleString()}): Modest market orders trigger severe slippage.`);
      investigateNext.push('Check if liquidity is expanding or if creator is pulling LP.');
    } else {
      liqScore -= 15;
      liquiditySizeTier = 'THIN';
      slippageRisk = 'MEDIUM';
      liquidityRisk = '🟡 MEDIUM';
      liqFactors.push(`Thin pool ($${market.liquidityUsd.toLocaleString()})`);
      riskDrivers.push(`Thin Liquidity ($${market.liquidityUsd.toLocaleString()})`);
    }

    if (security.isLpLocked && security.lpLockedPct >= 80) {
      liqScore += 15;
      liqFactors.push(`${security.lpLockedPct}% LP locked/burned`);
    } else {
      liqScore -= 20;
      if (liquidityRisk === '🟢 LOW') liquidityRisk = '🟡 MEDIUM';
      liqFactors.push(`Low LP lock (${security.lpLockedPct}%)`);
    }

    const liqToMcRatio = market.marketCap > 0 ? Number(((market.liquidityUsd / market.marketCap) * 100).toFixed(1)) : 10;
    const liqToFdvRatio = market.fdv > 0 ? Number(((market.liquidityUsd / market.fdv) * 100).toFixed(1)) : 10;
    const volToLiqVelocity = market.liquidityUsd > 0 ? Number((market.volume24h / market.liquidityUsd).toFixed(2)) : 0;

    liqScore = Math.max(5, Math.min(100, liqScore));
    const liqRating = liqScore >= 75 ? 'EXCELLENT' : liqScore >= 55 ? 'GOOD' : liqScore >= 35 ? 'MODERATE' : 'POOR';
    const liqBadge = liqScore >= 65 ? '🟢' : liqScore >= 40 ? '🟡' : '🔴';

    // =========================================================================
    // 4. HOLDER SCORE (0 - 100) — Known vs Unknown Concentration
    // =========================================================================
    let holderScore = 60;
    const holderFactors: string[] = [];
    let concentrationRisk: RiskLevel = '🟢 LOW';
    let concentrationAssessment = 'DECENTRALIZED';

    const unkConc = security.unknownConcentrationPct || security.topHoldersPct;
    const largestUnk = security.largestUnknownHolderPct || security.largestHolderPct;

    if (largestUnk > 20) {
      holderScore -= 35;
      concentrationRisk = '🔴 CRITICAL';
      concentrationAssessment = 'EXTREME_UNKNOWN_CONCENTRATION';
      holderFactors.push(`Largest unknown wallet controls ${largestUnk}% of supply`);
      riskDrivers.push(`Whale Monopoly: Top unknown wallet controls ${largestUnk}%`);
      rankedRisks.push(`Single unknown wallet owns ${largestUnk}% of total supply: High single-point dump risk.`);
      investigateNext.push(`Inspect top unknown holder wallet (${largestUnk}%) on Solscan for insider funding.`);
    } else if (largestUnk > 10) {
      holderScore -= 15;
      concentrationRisk = '🟠 HIGH';
      concentrationAssessment = 'ELEVATED_CONCENTRATION';
      holderFactors.push(`Top unknown wallet holds ${largestUnk}%`);
      riskDrivers.push(`Elevated Top Holder: ${largestUnk}%`);
    } else if (largestUnk <= 5 && largestUnk > 0) {
      holderScore += 15;
      holderFactors.push(`Largest unknown holder holds only ${largestUnk}%`);
      positiveDrivers.push(`Healthy Single Holder Cap: ${largestUnk}%`);
    }

    if (unkConc > 45) {
      holderScore -= 20;
      if (concentrationRisk !== '🔴 CRITICAL') concentrationRisk = '🟠 HIGH';
      holderFactors.push(`Top 10 unknown wallets hold ${unkConc}%`);
      riskDrivers.push(`Top 10 Unknown Ownership: ${unkConc}%`);
    } else if (unkConc <= 25 && unkConc > 0) {
      holderScore += 15;
      holderFactors.push(`Top 10 hold only ${unkConc}%`);
      positiveDrivers.push(`Decentralized Holder Base: Top 10 hold ${unkConc}%`);
    }

    holderScore = Math.max(5, Math.min(100, holderScore));
    const holderRating = holderScore >= 75 ? 'EXCELLENT' : holderScore >= 55 ? 'GOOD' : holderScore >= 35 ? 'MODERATE' : 'CRITICAL';
    const holderBadge = holderScore >= 65 ? '🟢' : holderScore >= 40 ? '🟡' : '🔴';

    // =========================================================================
    // 5. ACTIVITY & FLOW SCORE (0 - 100)
    // =========================================================================
    let flowScore = 50;
    const flowFactors: string[] = [];
    let flowRisk: RiskLevel = '🟢 LOW';
    let flowInterpretation = 'BALANCED_FLOW';

    const totalTxns24h = market.txns24h.buys + market.txns24h.sells;

    if (market.buySellRatio24h >= 1.5) {
      flowScore += 25;
      flowInterpretation = 'STRONG_BUY_PRESSURE';
      flowRisk = '🟢 LOW';
      flowFactors.push(`Heavy buy pressure (${market.buySellRatio24h}:1 flow)`);
      positiveDrivers.push(`Dominant Buy Flow: ${market.buySellRatio24h}:1 (${market.txns24h.buys.toLocaleString()} buys vs ${market.txns24h.sells.toLocaleString()} sells)`);
      opportunitySignals.push({
        type: 'BULLISH',
        tag: '📈 BUY PRESSURE DOMINATING',
        description: `Buyers outnumber sellers ${market.buySellRatio24h}:1 with ${market.txns24h.buys.toLocaleString()} buy orders.`
      });
    } else if (market.buySellRatio24h >= 1.1) {
      flowScore += 10;
      flowInterpretation = 'MODERATE_BUY_PRESSURE';
      flowRisk = '🟢 LOW';
    } else if (market.buySellRatio24h <= 0.65) {
      flowScore -= 30;
      flowInterpretation = 'HEAVY_SELL_PRESSURE';
      flowRisk = '🔴 CRITICAL';
      flowFactors.push(`Heavy sell dominance (${market.buySellRatio24h}:1 flow)`);
      riskDrivers.push(`Heavy Sell Pressure: ${market.txns24h.sells.toLocaleString()} sells vs ${market.txns24h.buys.toLocaleString()} buys`);
      rankedRisks.push(`Severe sell pressure (${market.buySellRatio24h}:1 ratio): Outgoing distribution exceeds demand.`);
      opportunitySignals.push({
        type: 'BEARISH',
        tag: '📉 SELL PRESSURE ELEVATED',
        description: `Sellers dominating transaction flow (${market.txns24h.sells.toLocaleString()} sells vs ${market.txns24h.buys.toLocaleString()} buys).`
      });
      investigateNext.push('Monitor whether buy volume absorbs ongoing sell orders or if flow weakens further.');
    } else if (market.buySellRatio24h <= 0.85) {
      flowScore -= 15;
      flowInterpretation = 'MODERATE_SELL_PRESSURE';
      flowRisk = '🟡 MEDIUM';
    }

    if (market.volume24h >= 250000) {
      flowScore += 15;
      flowFactors.push(`High 24h volume ($${market.volume24h.toLocaleString()})`);
      positiveDrivers.push(`Active Trading Volume: $${market.volume24h.toLocaleString()} in 24h`);
    } else if (market.volume24h < 5000) {
      flowScore -= 15;
      if (flowRisk === '🟢 LOW') flowRisk = '🟡 MEDIUM';
      flowFactors.push(`Low trading volume ($${market.volume24h.toLocaleString()})`);
      riskDrivers.push(`Low 24h Volume ($${market.volume24h.toLocaleString()})`);
    }

    flowScore = Math.max(5, Math.min(100, flowScore));
    const flowRating = flowScore >= 75 ? 'EXCELLENT' : flowScore >= 55 ? 'GOOD' : flowScore >= 35 ? 'MODERATE' : 'POOR';
    const flowBadge = flowScore >= 65 ? '🟢' : flowScore >= 40 ? '🟡' : '🔴';

    // =========================================================================
    // 6. SMART MONEY SCORE (OPTIONAL)
    // =========================================================================
    let smartMoneyDimension: DimensionScore | undefined = undefined;
    let smartMoneyRisk: RiskLevel = '⚪ UNKNOWN';

    if (hasSmartMoneyData && smartMoneyScoreVal !== undefined) {
      const smRating = smartMoneyScoreVal >= 70 ? 'EXCELLENT' : smartMoneyScoreVal >= 45 ? 'MODERATE' : 'POOR';
      smartMoneyRisk = smartMoneyScoreVal >= 60 ? '🟢 LOW' : (smartMoneyScoreVal < 35 ? '🔴 CRITICAL' : '🟡 MEDIUM');
      smartMoneyDimension = {
        score: smartMoneyScoreVal,
        rating: smRating,
        badge: smartMoneyScoreVal >= 60 ? '🟢' : '🟡',
        summary: smartMoneyScoreVal >= 60 ? 'Tracked wallet accumulation detected' : 'Neutral smart money flow',
        keyFactors: ['On-chain tracked wallet interaction verified']
      };
    }

    // =========================================================================
    // 7. COMPOSITE OVERALL SCORE & SANITY CEILINGS
    // =========================================================================
    let rawOverall = Math.round(
      secScore * 0.25 +
      momScore * 0.25 +
      liqScore * 0.20 +
      holderScore * 0.15 +
      flowScore * 0.15
    );

    // Sanity Rule 1: Catastrophic 24h Drawdown (<= -50%)
    if (market.priceChange24h <= -50) {
      const maxAllowed = 40;
      if (rawOverall > maxAllowed) {
        appliedCeilings.push({
          ruleName: 'CATASTROPHIC_DRAWDOWN_CEILING',
          reason: `24h price collapsed by ${market.priceChange24h}%. Score capped at ${maxAllowed}/100 regardless of security status.`,
          maxScoreAllowed: maxAllowed
        });
        rawOverall = Math.min(rawOverall, maxAllowed);
      }
    }
    // Sanity Rule 2: Severe Drawdown (<= -30%) with negative 1h
    else if (market.priceChange24h <= -30 && market.priceChange1h < 0) {
      const maxAllowed = 52;
      if (rawOverall > maxAllowed) {
        appliedCeilings.push({
          ruleName: 'SEVERE_DRAWDOWN_CEILING',
          reason: `24h drawdown (${market.priceChange24h}%) with active 1h selling (${market.priceChange1h}%). Capped at ${maxAllowed}/100.`,
          maxScoreAllowed: maxAllowed
        });
        rawOverall = Math.min(rawOverall, maxAllowed);
      }
    }

    // Sanity Rule 3: Critical Contract Vulnerability (Mint/Freeze Active)
    if (security.isFreezable || security.isMintable) {
      const maxAllowed = 25;
      appliedCeilings.push({
        ruleName: 'CRITICAL_SECURITY_VULNERABILITY',
        reason: `${security.isFreezable ? 'Freeze' : 'Mint'} authority is active. Overall score capped at ${maxAllowed}/100.`,
        maxScoreAllowed: maxAllowed
      });
      rawOverall = Math.min(rawOverall, maxAllowed);
    }

    // Sanity Rule 4: Micro Liquidity (< $5,000)
    if (market.liquidityUsd < 5000) {
      const maxAllowed = 35;
      if (rawOverall > maxAllowed) {
        appliedCeilings.push({
          ruleName: 'MICRO_LIQUIDITY_CEILING',
          reason: `Pool liquidity is only $${market.liquidityUsd.toLocaleString()}. Capped at ${maxAllowed}/100 due to extreme slippage risk.`,
          maxScoreAllowed: maxAllowed
        });
        rawOverall = Math.min(rawOverall, maxAllowed);
      }
    }

    // Sanity Rule 5: Extreme Whale Domination (> 25% single holder)
    if (largestUnk > 25) {
      const maxAllowed = 45;
      if (rawOverall > maxAllowed) {
        appliedCeilings.push({
          ruleName: 'WHALE_MONOPOLY_CEILING',
          reason: `Single unknown wallet controls ${largestUnk}% of supply. Capped at ${maxAllowed}/100.`,
          maxScoreAllowed: maxAllowed
        });
        rawOverall = Math.min(rawOverall, maxAllowed);
      }
    }

    const finalScore = Math.max(5, Math.min(98, rawOverall));

    // Determine Classification
    let overallClassification: MultiDimensionalScoreResult['overallClassification'] = 'HEALTHY_SETUP';
    let overallBadge = '🟢 STRONG ALPHA';

    if (finalScore >= 80) {
      overallClassification = 'STRONG_ALPHA';
      overallBadge = '🟢 STRONG ALPHA';
    } else if (finalScore >= 60) {
      overallClassification = 'HEALTHY_SETUP';
      overallBadge = '🟢 HEALTHY SETUP';
    } else if (finalScore >= 40) {
      overallClassification = 'CAUTION_DEGEN';
      overallBadge = '🟡 CAUTION (MODERATE RISK)';
    } else if (finalScore >= 25) {
      overallClassification = 'HIGH_RISK_AVOID';
      overallBadge = '🔴 HIGH RISK (AVOID)';
    } else {
      overallClassification = 'CRITICAL_DANGER';
      overallBadge = '🚨 CRITICAL DANGER';
    }

    // Data Confidence
    let dataConfidence: DataConfidenceLevel = 'HIGH';
    let confidenceReason = 'Full market, security, liquidity, and holder distributions validated.';

    if (!market.pairCreatedAt || security.risks.length === 0 || market.liquidityUsd === 0) {
      dataConfidence = 'MEDIUM';
      confidenceReason = 'Core market metrics confirmed, but some historical timestamps were sparse.';
    }
    if (market.volume24h === 0 && totalTxns24h === 0) {
      dataConfidence = 'LOW';
      confidenceReason = 'Very low on-chain transaction sample size available.';
    }

    // Synthesize Takeaways
    takeawayBullets.push(
      security.isMintable || security.isFreezable ? 'Contract Vulnerabilities Active ❌' : 'Clean Contract Authorities ✅'
    );
    takeawayBullets.push(
      market.liquidityUsd >= 25000 ? `Adequate Liquidity ($${market.liquidityUsd.toLocaleString()}) ✅` : `Thin Liquidity ($${market.liquidityUsd.toLocaleString()}) ⚠️`
    );
    takeawayBullets.push(
      market.priceChange24h <= -25 ? `Heavy Downward Momentum (${market.priceChange24h}%) ❌` : (market.priceChange24h > 10 ? `Positive Momentum (+${market.priceChange24h}%) ✅` : `Consolidating Price Action ⚠️`)
    );
    takeawayBullets.push(
      largestUnk > 15 ? `Elevated Whale Concentration (${largestUnk}%) ⚠️` : `Distributed Holder Base ✅`
    );
    takeawayBullets.push(
      market.buySellRatio24h >= 1.2 ? `Buyers Dominating Flow (${market.buySellRatio24h}:1) ✅` : (market.buySellRatio24h < 0.8 ? `Sellers Dominating Flow (${market.buySellRatio24h}:1) ❌` : `Balanced Buy/Sell Flow ⚠️`)
    );

    if (rankedRisks.length === 0) {
      rankedRisks.push('No critical vulnerabilities detected based on current validated on-chain metrics.');
    }

    if (investigateNext.length === 0) {
      investigateNext.push('Monitor buy/sell order volume on 5m chart for continuation signals.');
      investigateNext.push('Observe whether pool liquidity expands with increased trading volume.');
    }

    return {
      overallScore: finalScore,
      overallClassification,
      overallBadge,
      dataConfidence,
      confidenceReason,
      security: {
        score: secScore,
        rating: secRating,
        badge: secBadge,
        summary: security.isFreezable || security.isMintable ? 'Unrevoked dangerous authorities' : 'Permanent authority revocation & lock verified',
        keyFactors: secFactors
      },
      momentum: {
        score: momScore,
        rating: momRating,
        badge: momBadge,
        trajectory,
        divergenceNote,
        summary: `5m: ${market.priceChange5m >= 0 ? '+' : ''}${market.priceChange5m}% | 1h: ${market.priceChange1h >= 0 ? '+' : ''}${market.priceChange1h}% | 24h: ${market.priceChange24h >= 0 ? '+' : ''}${market.priceChange24h}%`,
        keyFactors: momFactors
      },
      liquidity: {
        score: liqScore,
        rating: liqRating,
        badge: liqBadge,
        liquiditySizeTier,
        liqToMcRatio,
        liqToFdvRatio,
        volToLiqVelocity,
        slippageRisk,
        summary: `$${market.liquidityUsd.toLocaleString()} (${security.lpLockedPct}% Locked)`,
        keyFactors: liqFactors
      },
      holders: {
        score: holderScore,
        rating: holderRating,
        badge: holderBadge,
        knownConcentrationPct: security.knownConcentrationPct,
        unknownConcentrationPct: unkConc,
        largestUnknownHolderPct: largestUnk,
        concentrationAssessment,
        summary: `Largest: ${largestUnk}% | Top 10: ${unkConc}%`,
        keyFactors: holderFactors
      },
      flow: {
        score: flowScore,
        rating: flowRating,
        badge: flowBadge,
        flowInterpretation,
        summary: `${market.txns24h.buys.toLocaleString()} Buys / ${market.txns24h.sells.toLocaleString()} Sells (${market.buySellRatio24h}:1)`,
        keyFactors: flowFactors
      },
      smartMoney: smartMoneyDimension,
      riskProfile: {
        contract: contractRisk,
        liquidity: liquidityRisk,
        momentum: momentumRisk,
        concentration: concentrationRisk,
        flow: flowRisk,
        smartMoney: smartMoneyRisk
      },
      positiveDrivers,
      riskDrivers,
      appliedCeilings,
      opportunitySignals,
      rankedRisks,
      investigateNext,
      takeawayBullets
    };
  }
}
