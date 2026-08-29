import { Context, InlineKeyboard } from 'grammy';
import { db } from '../../db/database.js';
import { SolanaService } from '../../services/solana.service.js';

export const handleTrackWallet = async (ctx: Context) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const text = ctx.message?.text || '';
  const parts = text.split(' ');

  // If no wallet provided, show current watchlist
  if (parts.length < 2) {
    const userWallets = db.getTrackedWallets(userId);
    let msg = `👛 <b>WHALE & SMART MONEY TRACKER</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

    if (userWallets.length === 0) {
      msg += `You are not tracking any wallets yet.\n\n`;
      msg += `<b>How to track a whale:</b>\n<code>/track &lt;Solana_Wallet_Address&gt; [Label]</code>\n\n`;
      msg += `<i>Example:</i>\n<code>/track 5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1 SmartWhale#1</code>`;
    } else {
      msg += `<b>Your Active Watchlist (${userWallets.length} wallets):</b>\n\n`;
      userWallets.forEach((w, i) => {
        msg += `${i + 1}. <b>${w.label || 'Whale Wallet'}</b>\n   <code>${w.walletAddress}</code>\n`;
      });
      msg += `\n<i>You will receive instant alerts when these wallets buy/sell tokens.</i>\n`;
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
  const label = parts.slice(2).join(' ') || 'Whale Wallet';

  // Check balance on-chain
  const balance = await SolanaService.getWalletBalance(walletAddress);

  const added = db.addTrackedWallet(userId, walletAddress, label);
  if (!added) {
    await ctx.reply(`⚠️ You are already tracking this wallet: <code>${walletAddress}</code>`, {
      parse_mode: 'HTML'
    });
    return;
  }

  await ctx.reply(
    `✅ <b>Wallet Added to Watchlist!</b>\n\n` +
    `🏷️ <b>Label:</b> ${label}\n` +
    `📍 <b>Address:</b> <code>${walletAddress}</code>\n` +
    `💰 <b>Current Balance:</b> ${balance.toFixed(2)} SOL\n\n` +
    `🔔 <i>AlphaViper will alert you immediately when this wallet executes on-chain swaps!</i>`,
    { parse_mode: 'HTML' }
  );
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
