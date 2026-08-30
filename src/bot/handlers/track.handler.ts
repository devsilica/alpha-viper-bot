import { Context, InlineKeyboard } from 'grammy';
import { db } from '../../db/database.js';
import { SolanaService } from '../../services/solana.service.js';

export const handleTrackWallet = async (ctx: Context) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const text = ctx.message?.text || '';
  const parts = text.split(' ').filter(p => p.trim().length > 0);

  // If no wallet provided, show active watchlist with on-chain intelligence
  if (parts.length < 2) {
    const userWallets = db.getTrackedWallets(userId);
    let msg = `👛 <b>WALLET INTELLIGENCE & TRACKER</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

    if (userWallets.length === 0) {
      msg += `You are not tracking any wallets yet.\n\n`;
      msg += `<b>How to track a wallet:</b>\n<code>/track &lt;Solana_Wallet_Address&gt; [Label]</code>\n\n`;
      msg += `<i>Example:</i>\n<code>/track 5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1 Whale#1</code>\n`;
      msg += `\nAlphaViper will alert you the moment this wallet executes on-chain swaps!`;
    } else {
      msg += `<b>Active Monitored Wallets (${userWallets.length}):</b>\n\n`;
      userWallets.forEach((w, i) => {
        msg += `${i + 1}. <b>${w.label || 'Whale Wallet'}</b>\n   <code>${w.walletAddress}</code>\n   Added: ${new Date(w.addedAt).toLocaleDateString()}\n\n`;
      });
      msg += `<i>You will receive instant alerts when these wallets buy or sell tokens.</i>\n`;
      msg += `\nTo remove: <code>/untrack &lt;WalletAddress&gt;</code>`;
    }

    const keyboard = new InlineKeyboard().text('🔙 Main Menu', 'action:main_menu');
    await ctx.reply(msg.trim(), {
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
    return;
  }

  const walletAddress = parts[1].trim();
  const label = parts.slice(2).join(' ') || 'Tracked Wallet';

  const loading = await ctx.reply(`👛 <i>Analyzing on-chain transactions & balance for <code>${walletAddress.slice(0, 8)}...</code></i>`, {
    parse_mode: 'HTML'
  });

  try {
    // 1. Fetch On-chain Balance
    const balance = await SolanaService.getWalletBalance(walletAddress);

    // 2. Fetch Recent Signatures
    const sigs = await SolanaService.getRecentSignatures(walletAddress, 5);

    // 3. Classify Wallet Profile
    let walletProfile = '🎯 Active Trader';
    if (balance >= 50) {
      walletProfile = '🐳 Solana Whale';
    } else if (balance < 0.5 && sigs.length > 0) {
      walletProfile = '⚡ Fast Sniper Wallet';
    } else if (sigs.length === 0) {
      walletProfile = '📦 Low-Activity Storage Wallet';
    }

    const added = db.addTrackedWallet(userId, walletAddress, label, sigs[0]);
    if (!added) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        loading.message_id,
        `⚠️ You are already tracking this wallet: <code>${walletAddress}</code>`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    const intelMsg = `
✅ <b>WALLET ADDED TO WATCHLIST!</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
🏷️ <b>Label:</b> <b>${label}</b>
📍 <b>Address:</b> <code>${walletAddress}</code>

📊 <b>WALLET PROFILE:</b>
• <b>Classification:</b> <b>${walletProfile}</b>
• <b>SOL Balance:</b> <b>${balance.toFixed(2)} SOL</b> (~$${Math.round(balance * 180).toLocaleString()})
• <b>Recent Activity:</b> ${sigs.length} on-chain signatures recorded

🔔 <i>AlphaViper is now monitoring this wallet 24/7 and will send you real-time alerts whenever it swaps tokens!</i>
━━━━━━━━━━━━━━━━━━━━━━━━━━
    `;

    const keyboard = new InlineKeyboard()
      .url('🧾 View on Solscan', `https://solscan.io/account/${walletAddress}`)
      .row()
      .text('👛 View Watchlist', 'action:track_prompt');

    await ctx.api.editMessageText(
      ctx.chat!.id,
      loading.message_id,
      intelMsg.trim(),
      {
        parse_mode: 'HTML',
        reply_markup: keyboard
      }
    );
  } catch (err: any) {
    console.error('Track handler error:', err);
    await ctx.api.editMessageText(
      ctx.chat!.id,
      loading.message_id,
      `❌ Error profiling wallet: ${err.message}`,
      { parse_mode: 'HTML' }
    );
  }
};

export const handleUntrackWallet = async (ctx: Context) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const text = ctx.message?.text || '';
  const parts = text.split(' ');
  if (parts.length < 2) {
    await ctx.reply('Usage: <code>/untrack &lt;WalletAddress&gt;</code>', { parse_mode: 'HTML' });
    return;
  }

  const walletAddress = parts[1].trim();
  const removed = db.removeTrackedWallet(userId, walletAddress);

  if (removed) {
    await ctx.reply(`✅ Removed <code>${walletAddress}</code> from your watchlist.`, { parse_mode: 'HTML' });
  } else {
    await ctx.reply(`❌ Wallet not found in your watchlist.`, { parse_mode: 'HTML' });
  }
};
