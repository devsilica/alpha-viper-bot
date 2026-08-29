import { config } from '../config/env.js';

export class JupiterService {
  // Base Jupiter swap terminal URL
  private static JUP_URL = 'https://jup.ag/swap';

  /**
   * Generates a 1-click buy link for Jupiter DEX with the developer's referral address
   */
  public static getSwapUrl(
    outputMint: string,
    inputMint: string = 'So11111111111111111111111111111111111111112' // SOL
  ): string {
    const treasury = config.TREASURY_WALLET_ADDRESS;
    // Jupiter direct swap route with referral param
    return `${this.JUP_URL}/${inputMint}-${outputMint}?feeBps=50&ref=${treasury}`;
  }

  /**
   * Generates a Raydium direct swap link
   */
  public static getRaydiumUrl(outputMint: string): string {
    return `https://raydium.io/swap/?inputMint=sol&outputMint=${outputMint}`;
  }

  /**
   * Generates a DexScreener chart URL
   */
  public static getDexScreenerUrl(tokenAddress: string): string {
    return `https://dexscreener.com/solana/${tokenAddress}`;
  }

  /**
   * Generates a Birdeye/Solscan chart link
   */
  public static getSolscanUrl(tokenAddress: string): string {
    return `https://solscan.io/token/${tokenAddress}`;
  }
}
