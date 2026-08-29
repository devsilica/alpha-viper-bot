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
  priceChange5m: number;
  priceChange1h: number;
  priceChange24h: number;
  txns24h: {
    buys: number;
    sells: number;
  };
  dexId: string;
  url: string;
  pairCreatedAt?: number;
}

export class DexScreenerService {
  private static BASE_URL = 'https://api.dexscreener.com/latest/dex';

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
        priceChange5m: Number(selectedPair.priceChange?.m5 || 0),
        priceChange1h: Number(selectedPair.priceChange?.h1 || 0),
        priceChange24h: Number(selectedPair.priceChange?.h24 || 0),
        txns24h: {
          buys: Number(selectedPair.txns?.h24?.buys || 0),
          sells: Number(selectedPair.txns?.h24?.sells || 0)
        },
        dexId: selectedPair.dexId || 'raydium',
        url: selectedPair.url || `https://dexscreener.com/solana/${selectedPair.pairAddress}`,
        pairCreatedAt: selectedPair.pairCreatedAt
      };
    } catch (err: any) {
      console.error('DexScreener API error:', err.message);
      return null;
    }
  }

  public static async getTrendingTokens(): Promise<TokenMarketData[]> {
    try {
      // Query top Solana pairs
      const response = await axios.get(`${this.BASE_URL}/search?q=SOL`, {
        timeout: 8000
      });

      const pairs = response.data?.pairs || [];
      const solPairs = pairs.filter(
        (p: any) => p.chainId === 'solana' && (p.liquidity?.usd || 0) >= 5000
      );

      // Sort by 24h volume
      solPairs.sort((a: any, b: any) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0));

      return solPairs.slice(0, 10).map((p: any) => ({
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
        priceChange5m: Number(p.priceChange?.m5 || 0),
        priceChange1h: Number(p.priceChange?.h1 || 0),
        priceChange24h: Number(p.priceChange?.h24 || 0),
        txns24h: {
          buys: Number(p.txns?.h24?.buys || 0),
          sells: Number(p.txns?.h24?.sells || 0)
        },
        dexId: p.dexId || 'raydium',
        url: p.url,
        pairCreatedAt: p.pairCreatedAt
      }));
    } catch (err: any) {
      console.error('Trending fetch error:', err.message);
      return [];
    }
  }
}
