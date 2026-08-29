import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { config } from '../config/env.js';
import { db } from '../db/database.js';

export interface PaymentVerificationResult {
  success: boolean;
  message: string;
  amountSol?: number;
  sender?: string;
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

      // Check if signature was already used
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

      // Inspect balance changes or transfer instructions for treasury wallet
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

      // Check instructions for direct system transfer
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

      // Allow 5% tolerance for slippage / rounding
      if (solTransferred < requiredAmountSol * 0.95) {
        return {
          success: false,
          message: `❌ Insufficient amount received: ${solTransferred.toFixed(3)} SOL (Required: ${requiredAmountSol} SOL).`
        };
      }

      // Record payment & upgrade user
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
}
