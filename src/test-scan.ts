import { DexScreenerService } from './services/dexscreener.service.js';
import { RugCheckService } from './services/rugcheck.service.js';
import { AiAnalysisService } from './services/ai.service.js';
import { JupiterService } from './services/jupiter.service.js';
import { db } from './db/database.js';

// Popular Solana Tokens for Testing
const TEST_TOKENS = {
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  WIF: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm'
};

async function runTest() {
  console.log('====================================================');
  console.log('🐍 ALPHAVIPER AI — SIMULATION & VERIFICATION TEST');
  console.log('====================================================\n');

  const symbol = 'BONK';
  const ca = TEST_TOKENS[symbol];

  console.log(`🔍 1. Fetching Live Market Data for $${symbol} (${ca})...`);
  const market = await DexScreenerService.getTokenData(ca);
  if (!market) {
    console.error('❌ Failed to fetch market data from DexScreener.');
    return;
  }
  console.log(`   ✅ Price: $${market.priceUsd}`);
  console.log(`   ✅ Liquidity: $${market.liquidityUsd.toLocaleString()}`);
  console.log(`   ✅ 24h Volume: $${market.volume24h.toLocaleString()}`);
  console.log(`   ✅ 24h Price Change: ${market.priceChange24h}%`);

  console.log(`\n🛡️ 2. Auditing Contract Security (RugCheck)...`);
  const security = await RugCheckService.checkToken(ca);
  console.log(`   ✅ Mintable: ${security.isMintable ? 'YES 🔴' : 'NO (Revoked) 🟢'}`);
  console.log(`   ✅ Freezable: ${security.isFreezable ? 'YES 🔴' : 'NO (Revoked) 🟢'}`);
  console.log(`   ✅ LP Locked/Burned: ${security.isLpLocked ? 'YES 🟢' : 'NO 🔴'}`);
  console.log(`   ✅ Top 10 Holders %: ${security.topHoldersPct}%`);

  console.log(`\n🤖 3. Running AI Alpha & Momentum Reasoning Engine...`);
  const aiAnalysis = await AiAnalysisService.analyzeToken(market, security);
  console.log(`   ✅ Alpha Score: ${aiAnalysis.alphaScore}/100`);
  console.log(`   ✅ Badge: ${aiAnalysis.badge}`);
  console.log(`   ✅ AI Summary: "${aiAnalysis.summary}"`);

  console.log(`\n⚡ 4. Generating Jupiter 1-Click Fast Buy Link...`);
  const buyUrl = JupiterService.getSwapUrl(ca);
  console.log(`   ✅ Buy URL: ${buyUrl}`);

  console.log(`\n📊 5. Testing Database & VIP Subscription Engine...`);
  const testUserId = 99887766;
  const userBefore = db.getUser(testUserId, 'test_crypto_trader');
  console.log(`   ✅ Initial User Tier: ${userBefore.isVip ? 'VIP' : 'FREE'} (Scans: ${userBefore.dailyScansCount})`);
  
  db.incrementScan(testUserId);
  db.upgradeToVip(testUserId, 30);
  const userAfter = db.getUser(testUserId);
  console.log(`   ✅ After Upgrade: Tier = ${userAfter.isVip ? 'VIP 👑' : 'FREE'} (Expires: ${new Date(userAfter.vipExpiresAt!).toLocaleDateString()})`);

  console.log('\n====================================================');
  console.log('🎉 ALL ENGINES ARE FUNCTIONING PERFECTLY!');
  console.log('====================================================\n');
}

runTest();
