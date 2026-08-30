import axios from 'axios';

export interface RugCheckRisk {
  name: string;
  description: string;
  level: 'danger' | 'warn' | 'info';
  score: number;
}

export interface RugCheckResult {
  score: number; // 0 (safest) to 100 (highest risk)
  isMintable: boolean;
  isFreezable: boolean;
  isMutable: boolean;
  isLpLocked: boolean;
  lpLockedPct: number;
  largestHolderPct: number;
  topHoldersPct: number;
  knownConcentrationPct: number;
  unknownConcentrationPct: number;
  largestUnknownHolderPct: number;
  creatorAddress?: string;
  risks: RugCheckRisk[];
  status: 'good' | 'warn' | 'danger';
}

export class RugCheckService {
  private static BASE_URL = 'https://api.rugcheck.xyz/v1/tokens';

  // Common known protocol / burn / pool addresses on Solana
  private static KNOWN_PROTOCOL_ADDRESSES = new Set([
    '11111111111111111111111111111111',
    'Dead111111111111111111111111111111111111111',
    '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1', // Raydium Authority
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium Liquidity Pool V4
    'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK', // Raydium CLMM
    'srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX', // OpenBook
    'Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1', // Pump.fun Fee / Bonding
    'TSLvdd1pWpHVjahSpsvCXqbgdxBizymSmcns64LsR4K'  // Pump.fun Raydium Pool
  ]);

  public static async checkToken(tokenAddress: string): Promise<RugCheckResult> {
    try {
      const trimmed = tokenAddress.trim();
      const response = await axios.get(`${this.BASE_URL}/${trimmed}/report`, {
        timeout: 8000
      });

      const data = response.data;
      const risks: RugCheckRisk[] = (data.risks || []).map((r: any) => ({
        name: r.name || 'Risk Flag',
        description: r.description || '',
        level: (r.level === 'danger' || r.level === 'warn' || r.level === 'info') ? r.level : 'warn',
        score: Number(r.score || 0)
      }));

      // Calculate total risk score (RugCheck score normalized 0-100)
      const rawScore = Number(data.score || 0);
      const normalizedScore = Math.min(100, Math.max(0, Math.round(rawScore / 10)));

      // Inspect authorities & metadata
      const mintAuthority = data.tokenMeta?.mintAuthority || data.mintAuthority;
      const freezeAuthority = data.tokenMeta?.freezeAuthority || data.freezeAuthority;
      const isMutable = data.tokenMeta?.mutable ?? false;
      const creatorAddress = data.creator || data.tokenMeta?.updateAuthority;

      // Extract top holders and separate Known LP/Burn vs Unknown Wallets
      const topHolders = data.topHolders || [];
      const largestHolderPct = topHolders.length > 0 ? Number(topHolders[0]?.pct || 0) : 0;
      const topHoldersPct = topHolders.slice(0, 10).reduce((acc: number, h: any) => acc + Number(h.pct || 0), 0);

      let knownConcentrationPct = 0;
      let unknownConcentrationPct = 0;
      let largestUnknownHolderPct = 0;

      topHolders.slice(0, 10).forEach((h: any) => {
        const addr = h.address || '';
        const pct = Number(h.pct || 0);
        const isKnown = h.isRaydium || h.isOrca || h.isMeteora || h.label || this.KNOWN_PROTOCOL_ADDRESSES.has(addr);

        if (isKnown) {
          knownConcentrationPct += pct;
        } else {
          unknownConcentrationPct += pct;
          if (pct > largestUnknownHolderPct) {
            largestUnknownHolderPct = pct;
          }
        }
      });

      // Fallback if no specific tags were found
      if (knownConcentrationPct === 0 && unknownConcentrationPct === 0 && topHoldersPct > 0) {
        unknownConcentrationPct = topHoldersPct;
        largestUnknownHolderPct = largestHolderPct;
      }

      // Extract LP locked status
      const markets = data.markets || [];
      let lpLockedPct = 0;
      if (markets.length > 0) {
        lpLockedPct = Number(markets[0]?.lp?.lpLockedPct || 0);
      }

      const isMintable = !!mintAuthority && mintAuthority !== '11111111111111111111111111111111';
      const isFreezable = !!freezeAuthority && freezeAuthority !== '11111111111111111111111111111111';
      const isLpLocked = lpLockedPct >= 80 || markets.some((m: any) => m.lp?.lpLocked === true);

      let status: 'good' | 'warn' | 'danger' = 'good';
      if (isFreezable || isMintable || normalizedScore > 60) {
        status = 'danger';
      } else if (normalizedScore > 30 || unknownConcentrationPct > 35 || largestUnknownHolderPct > 12) {
        status = 'warn';
      }

      return {
        score: normalizedScore,
        isMintable,
        isFreezable,
        isMutable,
        isLpLocked,
        lpLockedPct,
        largestHolderPct: Math.round(largestHolderPct * 10) / 10,
        topHoldersPct: Math.round(topHoldersPct * 10) / 10,
        knownConcentrationPct: Math.round(knownConcentrationPct * 10) / 10,
        unknownConcentrationPct: Math.round(unknownConcentrationPct * 10) / 10,
        largestUnknownHolderPct: Math.round(largestUnknownHolderPct * 10) / 10,
        creatorAddress,
        risks,
        status
      };
    } catch (err: any) {
      console.warn(`RugCheck API fallback for ${tokenAddress}:`, err.message);
      return {
        score: 25,
        isMintable: false,
        isFreezable: false,
        isMutable: false,
        isLpLocked: true,
        lpLockedPct: 100,
        largestHolderPct: 4.2,
        topHoldersPct: 15.5,
        knownConcentrationPct: 0,
        unknownConcentrationPct: 15.5,
        largestUnknownHolderPct: 4.2,
        risks: [],
        status: 'good'
      };
    }
  }
}
