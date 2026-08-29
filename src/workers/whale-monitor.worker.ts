import { Bot } from 'grammy';
import { db } from '../db/database.js';
import { SolanaService } from '../services/solana.service.js';

export class WhaleMonitorWorker {
  private static lastSignatures: Map<string, string> = new Map();
  private static isRunning = false;

  public static start(bot: Bot) {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('🐋 Whale Monitor Background Worker started (Polling interval: 45s)...');

    setInterval(async () => {
      try {
        const trackedWallets = db.getTrackedWallets();
        if (trackedWallets.length === 0) return;

        for (const item of trackedWallets) {
          const sigs = await SolanaService.getRecentSignatures(item.walletAddress, 1);
          if (sigs.length > 0) {
            const latestSig = sigs[0];
            const cachedSig = this.lastSignatures.get(item.walletAddress);

            // First time seeing this wallet, seed cache
            if (!cachedSig) {
              this.lastSignatures.set(item.walletAddress, latestSig);
              continue;
            }

            // New transaction detected!
            if (latestSig !== cachedSig) {
              this.lastSignatures.set(item.walletAddress, latestSig);
              
              const alertMsg = `
🚨 <b>WHALE MOVEMENT DETECTED!</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
🏷️ <b>Label:</b> ${item.label || 'Whale Wallet'}
📍 <b>Wallet:</b> <code>${item.walletAddress}</code>
🧾 <b>Tx Signature:</b> <code>${latestSig}</code>

🔗 <a href="https://solscan.io/tx/${latestSig}">View Transaction on Solscan</a>
━━━━━━━━━━━━━━━━━━━━━━━━━━
              `;

              try {
                await bot.api.sendMessage(item.userId, alertMsg.trim(), {
                  parse_mode: 'HTML',
                  link_preview_options: { is_disabled: true }
                });
              } catch (sendErr: any) {
                console.warn(`Failed to send alert to user ${item.userId}:`, sendErr.message);
              }
            }
          }
        }
      } catch (err: any) {
        console.error('Whale monitor worker error:', err.message);
      }
    }, 45000); // Check every 45s to stay well within free RPC rate limits
  }
}
