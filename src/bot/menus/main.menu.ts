import { InlineKeyboard } from 'grammy';
import { JupiterService } from '../../services/jupiter.service.js';

export const createMainMenuKeyboard = (isVip: boolean = false): InlineKeyboard => {
  const keyboard = new InlineKeyboard()
    .text('🔍 Scan Token', 'action:scan_prompt')
    .text('🔥 Trending Alpha', 'action:trending')
    .row()
    .text('👛 Track Whale', 'action:track_prompt')
    .text(isVip ? '👑 VIP Active' : '⭐ Upgrade VIP', 'action:vip_info')
    .row()
    .url('💬 Join Community', 'https://t.me/SolanaAlphaHub');

  return keyboard;
};

export const createTokenAuditKeyboard = (tokenAddress: string, pairUrl?: string): InlineKeyboard => {
  const jupBuyUrl = JupiterService.getSwapUrl(tokenAddress);
  const chartUrl = pairUrl || JupiterService.getDexScreenerUrl(tokenAddress);
  const solscanUrl = JupiterService.getSolscanUrl(tokenAddress);

  return new InlineKeyboard()
    .url('⚡ Buy on Jupiter', jupBuyUrl)
    .url('📊 Chart', chartUrl)
    .row()
    .url('🔍 Solscan', solscanUrl)
    .text('🔄 Re-Audit', `action:rescan:${tokenAddress}`)
    .row()
    .text('👑 Upgrade to VIP (Unlimited)', 'action:vip_info');
};

export const createVipUpgradeKeyboard = (treasuryAddress: string): InlineKeyboard => {
  return new InlineKeyboard()
    .text('✅ Verify Payment Hash', 'action:verify_prompt')
    .row()
    .url('💳 Open Phantom / Solflare', `https://phantom.app/ul/browse/https://jup.ag`)
    .row()
    .text('🔙 Back to Main Menu', 'action:main_menu');
};
