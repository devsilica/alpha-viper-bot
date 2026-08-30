import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { config } from '../config/env.js';
import { db } from '../db/database.js';

export interface PaymentVerificationResult {
  success: boolean;
  message: string;
  amountSol?: number;
  sender?: string;
}

export interface ParsedWhaleTrade {
  signature: string;
  walletAddress: string;
  tokenMint: string;
  tokenSymbol?: string;
  tokenName?: string;
  action: 'BUY' | 'SELL' | 'TRANSFER';
  amountSol: number;
  amountUsd: number;
  tokenAmount: number;
  isMeaningful: boolean; // meets threshold
}

export class SolanaService {
  private static connection = new Connection(config.SOLANA_RPC_URL, 'confirmed');

  public static getTreasuryAddress(): string {
    return config.TREASURY_WALLET_ADDRESS;
  }

  public static async verifyPaymentSignature(
    signature: string,
    telegramId: number,
    requiredAmountSol: number = config.VIP_PRICE_SOL
  ): Promise<PaymentVerificationResult> {
    try {
      const cleanSig = signature.trim();

      if (db.isSignatureUsed(cleanSig)) {
        return {
          success: false,
          message: '❌ This transaction signature has already been used to claim VIP status.'
        };
      }

      const treasuryPubkey = new PublicKey(config.TREASURY_WALLET_ADDRESS);
      const parsedTx = await this.connection.getParsedTransaction(cleanSig, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed'
      });

      if (!parsedTx) {
        return {
          success: false,
          message: '❌ Transaction not found on Solana mainnet. Please wait 10 seconds for confirmation or check your tx hash.'
        };
      }

      if (parsedTx.meta?.err) {
        return {
          success: false,
          message: '❌ This transaction failed on-chain.'
        };
      }

      let solTransferred = 0;
      let senderAddress = '';

      const accountKeys = parsedTx.transaction.message.accountKeys;
      const treasuryIndex = accountKeys.findIndex((a: any) =>
        (a.pubkey ? a.pubkey.toBase58() : a.toBase58()) === treasuryPubkey.toBase58()
      );

      if (treasuryIndex !== -1 && parsedTx.meta?.postBalances && parsedTx.meta?.preBalances) {
        const preBalance = parsedTx.meta.preBalances[treasuryIndex];
        const postBalance = parsedTx.meta.postBalances[treasuryIndex];
        const diffLamports = postBalance - preBalance;
        if (diffLamports > 0) {
          solTransferred = diffLamports / LAMPORTS_PER_SOL;
        }
      }

      const instructions = parsedTx.transaction.message.instructions;
      for (const ix of instructions as any[]) {
        if (ix.program === 'system' && ix.parsed?.type === 'transfer') {
          const info = ix.parsed.info;
          if (info.destination === treasuryPubkey.toBase58()) {
            solTransferred = Math.max(solTransferred, Number(info.lamports) / LAMPORTS_PER_SOL);
            senderAddress = info.source;
          }
        }
      }

      if (solTransferred < requiredAmountSol * 0.95) {
        return {
          success: false,
          message: `❌ Insufficient amount received: ${solTransferred.toFixed(3)} SOL (Required: ${requiredAmountSol} SOL).`
        };
      }

      db.addPayment(cleanSig, telegramId, solTransferred);
      db.upgradeToVip(telegramId, 30);

      return {
        success: true,
        message: `✅ Payment verified successfully! Received ${solTransferred.toFixed(3)} SOL.\n👑 30 Days VIP Membership Activated!`,
        amountSol: solTransferred,
        sender: senderAddress
      };
    } catch (err: any) {
      console.error('Payment verification error:', err);
      return {
        success: false,
        message: `❌ Error verifying transaction: ${err.message}`
      };
    }
  }

  public static async getWalletBalance(walletAddress: string): Promise<number> {
    try {
      const pubkey = new PublicKey(walletAddress.trim());
      const balance = await this.connection.getBalance(pubkey);
      return balance / LAMPORTS_PER_SOL;
    } catch {
      return 0;
    }
  }

  public static async getRecentSignatures(walletAddress: string, limit: number = 3): Promise<string[]> {
    try {
      const pubkey = new PublicKey(walletAddress.trim());
      const sigs = await this.connection.getSignaturesForAddress(pubkey, { limit });
      return sigs.map(s => s.signature);
    } catch {
      return [];
    }
  }

  /**
   * Parses a Solana transaction signature into a structured Whale Trade event
   */
  public static async parseWhaleTransaction(signature: string, walletAddress: string): Promise<ParsedWhaleTrade | null> {
    try {
      const parsedTx = await this.connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed'
      });

      if (!parsedTx || parsedTx.meta?.err) return null;

      const preTokenBalances = parsedTx.meta?.preTokenBalances || [];
      const postTokenBalances = parsedTx.meta?.postTokenBalances || [];

      // Find token changes for the target wallet
      let targetMint = '';
      let tokenDiff = 0;

      for (const post of postTokenBalances) {
        if (post.owner?.toLowerCase() === walletAddress.toLowerCase()) {
          const pre = preTokenBalances.find(p => p.accountIndex === post.accountIndex && p.mint === post.mint);
          const preAmt = Number(pre?.uiTokenAmount?.uiAmount || 0);
          const postAmt = Number(post?.uiTokenAmount?.uiAmount || 0);
          const diff = postAmt - preAmt;

          // Ignore native SOL / WSOL wrapped mint as target if an SPL token is present
          if (post.mint !== 'So11111111111111111111111111111111111111112' && Math.abs(diff) > 0) {
            targetMint = post.mint;
            tokenDiff = diff;
            break;
          }
        }
      }

      if (!targetMint) return null;

      // Calculate approximate SOL flow
      const accountKeys = parsedTx.transaction.message.accountKeys;
      const walletIndex = accountKeys.findIndex((a: any) =>
        (a.pubkey ? a.pubkey.toBase58() : a.toBase58()).toLowerCase() === walletAddress.toLowerCase()
      );

      let solDiff = 0;
      if (walletIndex !== -1 && parsedTx.meta?.preBalances && parsedTx.meta?.postBalances) {
        const preSol = parsedTx.meta.preBalances[walletIndex];
        const postSol = parsedTx.meta.postBalances[walletIndex];
        solDiff = (postSol - preSol) / LAMPORTS_PER_SOL;
      }

      const isBuy = tokenDiff > 0;
      const action = isBuy ? 'BUY' : 'SELL';
      const absSol = Math.abs(solDiff);
      // Rough USD conversion at $180/SOL
      const approxUsd = Math.round(absSol * 180);

      // Filter out micro-dust (< 0.1 SOL or < $15)
      const isMeaningful = absSol >= 0.1 || Math.abs(tokenDiff) > 1000;

      return {
        signature,
        walletAddress,
        tokenMint: targetMint,
        action,
        amountSol: Number(absSol.toFixed(2)),
        amountUsd: approxUsd,
        tokenAmount: Math.abs(tokenDiff),
        isMeaningful
      };
    } catch (err: any) {
      console.warn(`Whale tx parse error for ${signature}:`, err.message);
      return null;
    }
  }
}
