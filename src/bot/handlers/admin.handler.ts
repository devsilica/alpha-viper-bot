import { Context } from 'grammy';
import { db } from '../../db/database.js';
import { isAdmin } from '../../config/env.js';

export const handleAdminStats = async (ctx: Context) => {
  const userId = ctx.from?.id;
  if (!userId || !isAdmin(userId)) {
    await ctx.reply('⛔ Unauthorized: Admin command only.');
    return;
  }

  const stats = db.getStats();

  const msg = `
📊 <b>ALPHAVIPER ADMIN DASHBOARD</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
👥 <b>Total Registered Users:</b> ${stats.totalUsers}
👑 <b>Active VIP Subscribers:</b> ${stats.vipUsersCount}
💳 <b>Total On-Chain Payments:</b> ${stats.totalPayments}
💰 <b>Total SOL Collected:</b> ${stats.totalSolCollected.toFixed(3)} SOL
👛 <b>Tracked Whale Wallets:</b> ${stats.totalTrackedWallets}
━━━━━━━━━━━━━━━━━━━━━━━━━━
💵 <i>Est. Total Revenue: $${(stats.totalSolCollected * 180).toFixed(2)} (at $180/SOL)</i>
  `;

  await ctx.reply(msg.trim(), { parse_mode: 'HTML' });
};
