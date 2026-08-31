import { InlineKeyboard } from 'grammy';
import { JupiterService } from '../../services/jupiter.service.js';

export const createMainMenuKeyboard = (isVip: boolean = false): InlineKeyboard => {
  const keyboard = new InlineKeyboard()
    .text('🔍 SCAN A TOKEN', 'action:scan_prompt')
    .text('🔥 TRENDING', 'action:trending')
    .row()
    .text('⚖️ COMPARE', 'action:compare_prompt')
    .text('🐋 TRACK WALLET', 'action:track_prompt')
    .row()
    .text('⭐ WATCHLIST', 'action:watchlist_view')
    .text(isVip ? '👑 VIP ACTIVE' : '👑 GET VIP', 'action:vip_info');

  return keyboard;
};

export const createTokenAuditKeyboard = (tokenAddress: string, pairUrl?: string): InlineKeyboard => {
  const jupBuyUrl = JupiterService.getSwapUrl(tokenAddress);
  const chartUrl = pairUrl || JupiterService.getDexScreenerUrl(tokenAddress);

  // Concise callback identifiers (under 64 bytes)
  return new InlineKeyboard()
    .url('⚡ Buy on Jupiter', jupBuyUrl)
    .url('📊 Chart', chartUrl)
    .row()
    .text('⭐ Watch', `t:wt:${tokenAddress}`)
    .text('🔔 Alert', `t:al:${tokenAddress}`)
    .text('🔄 Rescan', `t:rs:${tokenAddress}`)
    .row()
    .text('🐋 Track Creator', `t:tr:${tokenAddress}`)
    .text('⚖️ Compare', `t:cp:${tokenAddress}`)
    .row()
    .text('🎁 Refer & Earn (+5 Scans)', 'action:referral_info')
    .text('👑 VIP Upgrade', 'action:vip_info');
};

export const createVipUpgradeKeyboard = (treasuryAddress: string): InlineKeyboard => {
  return new InlineKeyboard()
    .text('✅ Verify Payment Hash', 'action:verify_prompt')
    .row()
    .url('💳 Open Phantom / Solflare', `https://phantom.app/ul/browse/https://jup.ag`)
    .row()
    .text('🎁 Earn Free Scans (/ref)', 'action:referral_info')
    .text('🔙 Main Menu', 'action:main_menu');
};
