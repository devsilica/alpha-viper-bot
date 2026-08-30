import { TokenMarketData } from './dexscreener.service.js';
import { RugCheckResult } from './rugcheck.service.js';

export interface DimensionAssessment {
  status: '🟢' | '🟡' | '🔴';
  label: string;
  detail: string;
  points: number; // 0 (safest) to 20 (riskiest)
}

export interface AlphaViperRiskAnalysis {
  overallRiskScore: number; // 0 (safest) to 100 (extreme risk)
  riskLevel: 'LOW_RISK' | 'MEDIUM_RISK' | 'HIGH_RISK' | 'CRITICAL_DANGER';
  riskBadge: string; // e.g. "🟢 LOW RISK", "🟡 MEDIUM RISK", "🔴 HIGH RISK"
  dimensions: {
    contract: DimensionAssessment;
    liquidity: DimensionAssessment;
    holders: DimensionAssessment;
    momentum: DimensionAssessment;
    activity: DimensionAssessment;
  };
  keyRisks: string[];
}

export class RiskAnalysisEngine {
  public static evaluateRisk(
    market: TokenMarketData,
    security: RugCheckResult
  ): AlphaViperRiskAnalysis {
    const keyRisks: string[] = [];

    // ==========================================
    // 1. CONTRACT RISK ASSESSMENT (0 - 20 pts)
    // ==========================================
    let contractPoints = 0;
    let contractStatus: '🟢' | '🟡' | '🔴' = '🟢';
    let contractDetail = 'Authorities Revoked';

    if (security.isFreezable) {
      contractPoints += 12;
      contractStatus = '🔴';
      contractDetail = 'Freeze Enabled (Honeypot Risk)';
      keyRisks.push('Freeze authority is active: creator can blacklist wallets and block selling.');
    }
    if (security.isMintable) {
      contractPoints += 8;
      contractStatus = '🔴';
      contractDetail = 'Mintable (Inflation Risk)';
      keyRisks.push('Mint authority is active: creator can print infinite supply and dump to $0.');
    }
    if (security.isMutable) {
      contractPoints += 2;
      if (contractStatus === '🟢') {
        contractStatus = '🟡';
        contractDetail = 'Metadata Mutable';
      }
      keyRisks.push('Token metadata is mutable: name, symbol, or image can be altered.');
    }
    if (contractPoints === 0) {
      contractDetail = 'Mint & Freeze Revoked';
    }

    // ==========================================
    // 2. LIQUIDITY RISK ASSESSMENT (0 - 20 pts)
    // ==========================================
    let liqPoints = 0;
    let liqStatus: '🟢' | '🟡' | '🔴' = '🟢';
    let liqDetail = `$${market.liquidityUsd.toLocaleString()} (${security.lpLockedPct}% Locked)`;

    if (!security.isLpLocked || security.lpLockedPct < 50) {
      liqPoints += 14;
      liqStatus = '🔴';
      liqDetail = `Unlocked LP (${security.lpLockedPct}%)`;
      keyRisks.push(`Liquidity pool is only ${security.lpLockedPct}% locked/burned (high pull risk).`);
    } else if (security.lpLockedPct < 85) {
      liqPoints += 6;
      liqStatus = '🟡';
      liqDetail = `Partial Lock (${security.lpLockedPct}%)`;
    }

    if (market.liquidityUsd < 5000) {
      liqPoints += 8;
      liqStatus = '🔴';
      keyRisks.push(`Micro liquidity ($${market.liquidityUsd.toLocaleString()}): trades over 0.5 SOL suffer massive slippage.`);
    } else if (market.liquidityUsd < 20000) {
      liqPoints += 4;
      if (liqStatus === '🟢') liqStatus = '🟡';
      keyRisks.push(`Low liquidity ($${market.liquidityUsd.toLocaleString()}): high volatility on moderate buy/sell orders.`);
    }

    // ==========================================
    // 3. HOLDERS CONCENTRATION RISK (0 - 20 pts)
    // ==========================================
    let holderPoints = 0;
    let holderStatus: '🟢' | '🟡' | '🔴' = '🟢';
    let holderDetail = `Top 10: ${security.topHoldersPct}% (Largest: ${security.largestHolderPct}%)`;

    if (security.largestHolderPct > 20) {
      holderPoints += 12;
      holderStatus = '🔴';
      keyRisks.push(`Largest single holder controls ${security.largestHolderPct}% of supply (single-wallet dump threat).`);
    } else if (security.largestHolderPct > 10) {
      holderPoints += 6;
      holderStatus = '🟡';
      keyRisks.push(`Top wallet holds ${security.largestHolderPct}% of total supply.`);
    }

    if (security.topHoldersPct > 45) {
      holderPoints += 8;
      holderStatus = '🔴';
      keyRisks.push(`Top 10 holders control ${security.topHoldersPct}% of total supply.`);
    } else if (security.topHoldersPct > 30) {
      holderPoints += 4;
      if (holderStatus === '🟢') holderStatus = '🟡';
    }

    // ==========================================
    // 4. MOMENTUM & FLOW RISK (0 - 20 pts)
    // ==========================================
    let momentumPoints = 0;
    let momentumStatus: '🟢' | '🟡' | '🔴' = '🟢';
    let momentumDetail = `Flow Ratio: ${market.buySellRatio24h}:1`;

    if (market.priceChange24h < -35) {
      momentumPoints += 8;
      momentumStatus = '🔴';
      keyRisks.push(`Heavy 24h drawdown (${market.priceChange24h}%): persistent sell pressure.`);
    } else if (market.priceChange24h < -15 || market.priceChange1h < -10) {
      momentumPoints += 4;
      momentumStatus = '🟡';
    }

    if (market.buySellRatio24h < 0.75) {
      momentumPoints += 6;
      momentumStatus = '🔴';
      momentumDetail = `Sell Heavy (${market.buySellRatio24h}:1)`;
      keyRisks.push(`Sellers dominating 24h volume (${market.txns24h.sells} sells vs ${market.txns24h.buys} buys).`);
    } else if (market.buySellRatio1h < 0.7) {
      momentumPoints += 3;
      if (momentumStatus === '🟢') momentumStatus = '🟡';
      keyRisks.push(`Short-term 1h sell pressure accelerating (${market.buySellRatio1h}:1 buy/sell).`);
    }

    // ==========================================
    // 5. ACTIVITY & AGE RISK (0 - 20 pts)
    // ==========================================
    let activityPoints = 0;
    let activityStatus: '🟢' | '🟡' | '🔴' = '🟢';
    let activityDetail = `${market.txns24h.buys + market.txns24h.sells} txns / 24h`;

    const totalTxns = market.txns24h.buys + market.txns24h.sells;
    if (totalTxns < 50) {
      activityPoints += 10;
      activityStatus = '🔴';
      activityDetail = `Inactive (${totalTxns} txns)`;
      keyRisks.push(`Very low transaction volume (${totalTxns} total trades in 24h): low organic interest.`);
    } else if (totalTxns < 250) {
      activityPoints += 5;
      activityStatus = '🟡';
    }

    if (market.volume24h < 5000) {
      activityPoints += 6;
      if (activityStatus === '🟢') activityStatus = '🟡';
      keyRisks.push(`Low 24h volume ($${market.volume24h.toLocaleString()}): order execution may stagnate.`);
    }

    // Calculate Total Risk Score (0 - 100)
    const totalRiskScore = Math.min(100, Math.max(5, contractPoints + liqPoints + holderPoints + momentumPoints + activityPoints));

    let riskLevel: AlphaViperRiskAnalysis['riskLevel'] = 'LOW_RISK';
    let riskBadge = '🟢 LOW RISK';

    if (security.isFreezable || security.isMintable || totalRiskScore >= 70) {
      riskLevel = 'HIGH_RISK';
      riskBadge = '🔴 HIGH RISK';
    } else if (totalRiskScore >= 40 || keyRisks.length >= 2) {
      riskLevel = 'MEDIUM_RISK';
      riskBadge = '🟡 MEDIUM RISK (CAUTION)';
    }

    if (keyRisks.length === 0) {
      keyRisks.push('No critical contract or liquidity vulnerabilities detected.');
    }

    return {
      overallRiskScore: totalRiskScore,
      riskLevel,
      riskBadge,
      dimensions: {
        contract: { status: contractStatus, label: 'Contract', detail: contractDetail, points: contractPoints },
        liquidity: { status: liqStatus, label: 'Liquidity', detail: liqDetail, points: liqPoints },
        holders: { status: holderStatus, label: 'Holders', detail: holderDetail, points: holderPoints },
        momentum: { status: momentumStatus, label: 'Momentum', detail: momentumDetail, points: momentumPoints },
        activity: { status: activityStatus, label: 'Activity', detail: activityDetail, points: activityPoints }
      },
      keyRisks
    };
  }
}
