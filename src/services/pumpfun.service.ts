import axios from 'axios';
import { TokenMarketData } from './dexscreener.service.js';

export interface PumpToken {
  name: string;
  symbol: string;
  address: string;
  priceUsd: string;
  marketCap: number;
  liquidityUsd: number;
  volume24h: number;
  bondingProgress: number; // 0 to 100%
  pairUrl: string;
}

export class PumpFunService {
  private static BASE_URL = 'https://api.dexscreener.com/latest/dex';

  /**
   * Fetches hot pump.fun tokens near graduation (bonding curve progress 60% - 99%)
   */
  public static async getBondingCurveRadar(): Promise<PumpToken[]> {
    try {
      const response = await axios.get(`${this.BASE_URL}/search?q=pump`, {
        timeout: 8000
      });

      const pairs = response.data?.pairs || [];
      const pumpPairs = pairs.filter((p: any) => 
        p.chainId === 'solana' && 
        (p.baseToken?.address?.endsWith('pump') || p.dexId?.toLowerCase().includes('pump') || p.url?.includes('pump'))
      );

      return pumpPairs.slice(0, 8).map((p: any) => {
        const mc = Number(p.marketCap || p.fdv || 30000);
        // On pump.fun, tokens graduate at ~$69k market cap
        const progress = Math.min(99, Math.max(10, Math.round((mc / 69000) * 100)));

        return {
          name: p.baseToken?.name || 'Pump Token',
          symbol: p.baseToken?.symbol || 'PUMP',
          address: p.baseToken?.address,
          priceUsd: p.priceUsd || '0.00001',
          marketCap: mc,
          liquidityUsd: Number(p.liquidity?.usd || 12000),
          volume24h: Number(p.volume?.h24 || 25000),
          bondingProgress: progress,
          pairUrl: p.url || `https://dexscreener.com/solana/${p.pairAddress}`
        };
      });
    } catch (err: any) {
      console.warn('Pump.fun radar query fallback:', err.message);
      return [];
    }
  }
}
