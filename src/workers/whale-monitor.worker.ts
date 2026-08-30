import { Bot, InlineKeyboard } from 'grammy';
import { db } from '../db/database.js';
import { SolanaService } from '../services/solana.service.js';
import { DexScreenerService } from '../services/dexscreener.service.js';
import { JupiterService } from '../services/jupiter.service.js';

export class WhaleMonitorWorker {
  private static isRunning = false;

  public static start(bot: Bot) {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('🐋 Smart Whale Intelligence Worker started (Interval: 45s)...');

    setInterval(async () => {
      try {
        const trackedWallets = db.getTrackedWallets();
        if (trackedWallets.length === 0) return;

        const uniqueWallets = Array.from(new Set(trackedWallets.map(tw => tw.walletAddress)));

        for (const walletAddress of uniqueWallets) {
          const sigs = await SolanaService.getRecentSignatures(walletAddress, 1);
          if (sigs.length === 0) continue;

          const latestSig = sigs[0];
          const subscribers = trackedWallets.filter(
            tw => tw.walletAddress.toLowerCase() === walletAddress.toLowerCase()
          );

          const lastKnownSig = subscribers[0]?.lastSignature;

          if (!lastKnownSig) {
            db.updateTrackedWalletSignature(walletAddress, latestSig);
            continue;
          }

          if (latestSig !== lastKnownSig) {
            db.updateTrackedWalletSignature(walletAddress, latestSig);

            const trade = await SolanaService.parseWhaleTransaction(latestSig, walletAddress);
            if (!trade || !trade.isMeaningful) continue;

            const market = await DexScreenerService.getTokenData(trade.tokenMint);
            const tokenSymbol = market ? market.baseToken.symbol : 'SPL';
            const tokenName = market ? market.baseToken.name : 'Unknown Token';
            const liqUsd = market ? market.liquidityUsd : 10000;

            const impactPct = liqUsd > 0 ? Number(((trade.amountUsd / liqUsd) * 100).toFixed(1)) : 0;

            let significance = 'NORMAL';
            let sigEmoji = '🟡';
            if (impactPct >= 5 || trade.amountUsd >= 5000) {
              significance = 'HIGH';
              sigEmoji = '🚨';
            } else if (impactPct >= 1.5 || trade.amountUsd >= 1000) {
              significance = 'MEDIUM';
              sigEmoji = '⚡';
            }

            const actionBadge = trade.action === 'BUY' ? '🟢 BUY (Accumulation)' : '🔴 SELL (Distribution)';
            const shortWallet = `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;

            const alertMessage = `
🐋 <b>ALPHAVIPER WHALE ALERT</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 <b>Wallet:</b> <code>${walletAddress}</code> (<i>${shortWallet}</i>)
🎯 <b>Action:</b> ${actionBadge}

💎 <b>Token:</b> <b>$${tokenSymbol}</b> (<code>${tokenName}</code>)
💰 <b>Amount:</b> <b>$${trade.amountUsd.toLocaleString()}</b> (<i>${trade.amountSol} SOL</i>)
💧 <b>Token Pool Liquidity:</b> $${liqUsd.toLocaleString()}
📊 <b>Trade / Liquidity Impact:</b> <b>${impactPct}%</b>

${sigEmoji} <b>SIGNIFICANCE:</b> <b>${significance}</b>
<i>AlphaViper detected on-chain ${trade.action.toLowerCase()} activity on Solana DEX.</i>
━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 <b>CA:</b> <code>${trade.tokenMint}</code>
            `;

            const keyboard = new InlineKeyboard()
              .text('🔍 Scan Token', `t:sc:${trade.tokenMint}`)
              .url('⚡ Buy on Jupiter', JupiterService.getSwapUrl(trade.tokenMint))
              .row()
              .url('🧾 View on Solscan', `https://solscan.io/tx/${latestSig}`)
              .text('👛 View Watchlist', 'action:track_prompt');

            for (const sub of subscribers) {
              try {
                await bot.api.sendMessage(sub.userId, alertMessage.trim(), {
                  parse_mode: 'HTML',
                  reply_markup: keyboard,
                  link_preview_options: { is_disabled: true }
                });
              } catch (sendErr: any) {
                console.warn(`Whale alert dispatch error for user ${sub.userId}:`, sendErr.message);
              }
            }
          }
        }
      } catch (err: any) {
        console.error('Whale monitor worker error:', err.message);
      }
    }, 45000);
  }
}
