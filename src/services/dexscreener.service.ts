import axios from 'axios';

export interface TokenMarketData {
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceUsd: string;
  priceNative: string;
  liquidityUsd: number;
  fdv: number;
  marketCap: number;
  volume24h: number;
  volume1h: number;
  volume5m: number;
  priceChange5m: number;
  priceChange1h: number;
  priceChange6h: number;
  priceChange24h: number;
  txns24h: {
    buys: number;
    sells: number;
  };
  txns1h: {
    buys: number;
    sells: number;
  };
  txns5m: {
    buys: number;
    sells: number;
  };
  buySellRatio24h: number;
  buySellRatio1h: number;
  dexId: string;
  url: string;
  pairCreatedAt?: number;
  pairAgeFormatted: string;
}

export class DexScreenerService {
  private static BASE_URL = 'https://api.dexscreener.com/latest/dex';

  private static formatPairAge(createdAt?: number): string {
    if (!createdAt) return 'Unknown Age';
    const ageMs = Date.now() - createdAt;
    const minutes = Math.floor(ageMs / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    return `${Math.max(1, minutes)}m`;
  }

  public static async getTokenData(tokenAddress: string): Promise<TokenMarketData | null> {
    try {
      const trimmed = tokenAddress.trim();
      const response = await axios.get(`${this.BASE_URL}/tokens/${trimmed}`, {
        timeout: 8000
      });

      const pairs = response.data?.pairs;
      if (!pairs || pairs.length === 0) {
        return null;
      }

      // Filter for Solana pairs and pick the one with the highest liquidity
      const solPairs = pairs.filter((p: any) => p.chainId === 'solana');
      const selectedPair = (solPairs.length > 0 ? solPairs : pairs).sort(
        (a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
      )[0];

      if (!selectedPair) return null;

      const buys24h = Number(selectedPair.txns?.h24?.buys || 0);
      const sells24h = Number(selectedPair.txns?.h24?.sells || 0);
      const buys1h = Number(selectedPair.txns?.h1?.buys || 0);
      const sells1h = Number(selectedPair.txns?.h1?.sells || 0);
      const buys5m = Number(selectedPair.txns?.m5?.buys || 0);
      const sells5m = Number(selectedPair.txns?.m5?.sells || 0);

      const ratio24h = sells24h > 0 ? Number((buys24h / sells24h).toFixed(2)) : (buys24h > 0 ? 2.0 : 1.0);
      const ratio1h = sells1h > 0 ? Number((buys1h / sells1h).toFixed(2)) : (buys1h > 0 ? 2.0 : 1.0);

      return {
        pairAddress: selectedPair.pairAddress,
        baseToken: {
          address: selectedPair.baseToken?.address || tokenAddress,
          name: selectedPair.baseToken?.name || 'Unknown Token',
          symbol: selectedPair.baseToken?.symbol || 'UNKNOWN'
        },
        priceUsd: selectedPair.priceUsd || '0.00',
        priceNative: selectedPair.priceNative || '0.00',
        liquidityUsd: Number(selectedPair.liquidity?.usd || 0),
        fdv: Number(selectedPair.fdv || 0),
        marketCap: Number(selectedPair.marketCap || selectedPair.fdv || 0),
        volume24h: Number(selectedPair.volume?.h24 || 0),
        volume1h: Number(selectedPair.volume?.h1 || 0),
        volume5m: Number(selectedPair.volume?.m5 || 0),
        priceChange5m: Number(selectedPair.priceChange?.m5 || 0),
        priceChange1h: Number(selectedPair.priceChange?.h1 || 0),
        priceChange6h: Number(selectedPair.priceChange?.h6 || 0),
        priceChange24h: Number(selectedPair.priceChange?.h24 || 0),
        txns24h: { buys: buys24h, sells: sells24h },
        txns1h: { buys: buys1h, sells: sells1h },
        txns5m: { buys: buys5m, sells: sells5m },
        buySellRatio24h: ratio24h,
        buySellRatio1h: ratio1h,
        dexId: selectedPair.dexId || 'raydium',
        url: selectedPair.url || `https://dexscreener.com/solana/${selectedPair.pairAddress}`,
        pairCreatedAt: selectedPair.pairCreatedAt,
        pairAgeFormatted: this.formatPairAge(selectedPair.pairCreatedAt)
      };
    } catch (err: any) {
      console.error('DexScreener API error:', err.message);
      return null;
    }
  }

  public static async getTrendingTokens(): Promise<TokenMarketData[]> {
    try {
      const response = await axios.get(`${this.BASE_URL}/search?q=SOL`, {
        timeout: 8000
      });

      const pairs = response.data?.pairs || [];
      const solPairs = pairs.filter(
        (p: any) => p.chainId === 'solana' && (p.liquidity?.usd || 0) >= 5000
      );

      solPairs.sort((a: any, b: any) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0));

      return solPairs.slice(0, 10).map((p: any) => {
        const buys24h = Number(p.txns?.h24?.buys || 0);
        const sells24h = Number(p.txns?.h24?.sells || 0);
        const ratio24h = sells24h > 0 ? Number((buys24h / sells24h).toFixed(2)) : 1.0;

        return {
          pairAddress: p.pairAddress,
          baseToken: {
            address: p.baseToken?.address,
            name: p.baseToken?.name,
            symbol: p.baseToken?.symbol
          },
          priceUsd: p.priceUsd || '0.00',
          priceNative: p.priceNative || '0.00',
          liquidityUsd: Number(p.liquidity?.usd || 0),
          fdv: Number(p.fdv || 0),
          marketCap: Number(p.marketCap || p.fdv || 0),
          volume24h: Number(p.volume?.h24 || 0),
          volume1h: Number(p.volume?.h1 || 0),
          volume5m: Number(p.volume?.m5 || 0),
          priceChange5m: Number(p.priceChange?.m5 || 0),
          priceChange1h: Number(p.priceChange?.h1 || 0),
          priceChange6h: Number(p.priceChange?.h6 || 0),
          priceChange24h: Number(p.priceChange?.h24 || 0),
          txns24h: { buys: buys24h, sells: sells24h },
          txns1h: { buys: Number(p.txns?.h1?.buys || 0), sells: Number(p.txns?.h1?.sells || 0) },
          txns5m: { buys: Number(p.txns?.m5?.buys || 0), sells: Number(p.txns?.m5?.sells || 0) },
          buySellRatio24h: ratio24h,
          buySellRatio1h: 1.0,
          dexId: p.dexId || 'raydium',
          url: p.url,
          pairCreatedAt: p.pairCreatedAt,
          pairAgeFormatted: this.formatPairAge(p.pairCreatedAt)
        };
      });
    } catch (err: any) {
      console.error('Trending fetch error:', err.message);
      return [];
    }
  }
}
