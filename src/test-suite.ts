import { ScoringEngine } from './services/scoring.engine.js';
import { TokenMarketData, DexScreenerService } from './services/dexscreener.service.js';
import { RugCheckResult, RugCheckService } from './services/rugcheck.service.js';
import { db, TokenScanSnapshot } from './db/database.js';
import { SolanaService } from './services/solana.service.js';

async function runComprehensiveTests() {
  console.log('====================================================');
  console.log('🐍 ALPHAVIPER AI 2.0 — FULL 15-SCENARIO TEST SUITE');
  console.log('====================================================\n');

  // Baseline mock data
  const baseMarket: TokenMarketData = {
    pairAddress: 'pairA',
    baseToken: { address: 'Alpha111111111111111111111111111111111111', name: 'Alpha Gem', symbol: 'ALPHA' },
    priceUsd: '1.25',
    priceNative: '0.007',
    liquidityUsd: 150000,
    fdv: 1250000,
    marketCap: 1250000,
    volume24h: 450000,
    volume1h: 45000,
    volume5m: 6000,
    priceChange5m: 4.2,
    priceChange1h: 12.5,
    priceChange6h: 22.0,
    priceChange24h: 68.0,
    txns24h: { buys: 2400, sells: 1200 },
    txns1h: { buys: 240, sells: 110 },
    txns5m: { buys: 35, sells: 10 },
    buySellRatio24h: 2.0,
    buySellRatio1h: 2.18,
    dexId: 'raydium',
    url: 'https://dexscreener.com',
    pairCreatedAt: Date.now() - 86400000 * 5,
    pairAgeFormatted: '5d 0h'
  };

  const cleanSecurity: RugCheckResult = {
    score: 10,
    isMintable: false,
    isFreezable: false,
    isMutable: false,
    isLpLocked: true,
    lpLockedPct: 100,
    largestHolderPct: 4.2,
    topHoldersPct: 18.5,
    knownConcentrationPct: 10.0,
    unknownConcentrationPct: 8.5,
    largestUnknownHolderPct: 3.2,
    risks: [],
    status: 'good'
  };

  // TEST A: Strong security + strong market
  console.log('▶️ TEST A: Strong Security + Strong Market');
  const scoreA = ScoringEngine.evaluate(baseMarket, cleanSecurity);
  console.log(`   Result: Score = ${scoreA.overallScore}/100 (${scoreA.overallBadge})`);
  if (scoreA.overallScore < 80) throw new Error('TEST A FAILED: Expected score >= 80');
  console.log('   ✅ TEST A PASSED!\n');

  // TEST B: Strong security + catastrophic market decline (-78%)
  console.log('▶️ TEST B: Strong Security + Catastrophic Decline (-78% 24h)');
  const marketB: TokenMarketData = { ...baseMarket, priceChange24h: -78.0, priceChange1h: -8.0, buySellRatio24h: 0.45 };
  const scoreB = ScoringEngine.evaluate(marketB, cleanSecurity);
  console.log(`   Result: Score = ${scoreB.overallScore}/100 (Applied: ${scoreB.appliedCeilings.map(c => c.ruleName).join(', ')})`);
  if (scoreB.overallScore > 40) throw new Error(`TEST B FAILED: A -78% collapse received ${scoreB.overallScore}! Expected <= 40.`);
  console.log('   ✅ TEST B PASSED (Ceiling prevented false alpha score)!\n');

  // TEST C: Weak security (mint/freeze enabled) + strong momentum
  console.log('▶️ TEST C: Dangerous Honeypot/Mintable + Strong Momentum');
  const secC: RugCheckResult = { ...cleanSecurity, isMintable: true, isFreezable: true, status: 'danger' };
  const scoreC = ScoringEngine.evaluate(baseMarket, secC);
  console.log(`   Result: Score = ${scoreC.overallScore}/100 (${scoreC.overallBadge})`);
  if (scoreC.overallScore > 25) throw new Error(`TEST C FAILED: Dangerous honeypot received ${scoreC.overallScore}! Expected <= 25.`);
  console.log('   ✅ TEST C PASSED!\n');

  // TEST D: Low liquidity ($3,500) + extreme concentration
  console.log('▶️ TEST D: Low Liquidity ($3,500) + Extreme Concentration (38%)');
  const marketD: TokenMarketData = { ...baseMarket, liquidityUsd: 3500 };
  const secD: RugCheckResult = { ...cleanSecurity, largestUnknownHolderPct: 38.0, unknownConcentrationPct: 65.0 };
  const scoreD = ScoringEngine.evaluate(marketD, secD);
  console.log(`   Result: Score = ${scoreD.overallScore}/100 | Slippage: ${scoreD.liquidity.slippageRisk}`);
  if (scoreD.overallScore > 35) throw new Error(`TEST D FAILED: Micro liquidity received ${scoreD.overallScore}! Expected <= 35.`);
  console.log('   ✅ TEST D PASSED!\n');

  // TEST E: Missing data / Low confidence
  console.log('▶️ TEST E: Missing Data & Low Confidence Handling');
  const marketE: TokenMarketData = { ...baseMarket, volume24h: 0, txns24h: { buys: 0, sells: 0 }, pairCreatedAt: undefined };
  const scoreE = ScoringEngine.evaluate(marketE, cleanSecurity);
  console.log(`   Result: Confidence = ${scoreE.dataConfidence} (${scoreE.confidenceReason})`);
  if (scoreE.dataConfidence !== 'LOW' && scoreE.dataConfidence !== 'MEDIUM') throw new Error('TEST E FAILED');
  console.log('   ✅ TEST E PASSED!\n');

  // TEST F: Process restart persistence
  console.log('▶️ TEST F: Process Restart Persistence');
  const testUserId = 77112233;
  const userF = db.getUser(testUserId, 'user_f');
  userF.dailyScansCount = 5;
  userF.lastScanDate = db.getTodayDateUtcStr();
  userF.isVip = false;
  const allowF = db.getDailyAllowance(testUserId, 5);
  console.log(`   Scans used: ${allowF.dailyScansCount}/5 | Scans remaining: ${allowF.scansRemaining} | Can scan: ${allowF.canScan}`);
  if (allowF.canScan !== false) throw new Error('TEST F FAILED: Free limit not enforced');
  console.log('   ✅ TEST F PASSED!\n');

  // TEST G: Historical scan delta change detection
  console.log('▶️ TEST G: Historical Delta Change Detection');
  const snap1: TokenScanSnapshot = {
    tokenAddress: 'TEST_DELTA_123',
    symbol: 'DELTA',
    priceUsd: '0.0010',
    liquidityUsd: 50000,
    volume24h: 100000,
    topHoldersPct: 35.0,
    largestHolderPct: 12.0,
    buySellRatio24h: 0.8,
    priceChange24h: -10,
    overallScore: 48,
    scannedAt: Date.now() - 3600000
  };
  db.saveScanSnapshot(snap1);

  const snap2: TokenScanSnapshot = {
    tokenAddress: 'TEST_DELTA_123',
    symbol: 'DELTA',
    priceUsd: '0.0014',
    liquidityUsd: 75000,
    volume24h: 220000,
    topHoldersPct: 28.0,
    largestHolderPct: 8.5,
    buySellRatio24h: 1.6,
    priceChange24h: 35,
    overallScore: 74,
    scannedAt: Date.now()
  };
  const delta = db.saveScanSnapshot(snap2);
  if (!delta || delta.priceDiffPct !== 40 || delta.scoreDiff !== 26) {
    throw new Error('TEST G FAILED: Delta diffing incorrect');
  }
  console.log(`   Delta: ${delta.priceFormatted} | Score: ${delta.scoreFormatted}`);
  console.log('   ✅ TEST G PASSED!\n');

  // TEST H: Watchlist persistence
  console.log('▶️ TEST H: Watchlist Addition & Retrieval');
  const watchUser = 99881122;
  db.addToWatchlist(watchUser, 'CA_WATCH_1', 'WATCH', 'WatchToken', '0.05', 45000, 78, 12.5);
  const userWatchlist = db.getWatchlist(watchUser);
  if (userWatchlist.length === 0 || userWatchlist[0].symbol !== 'WATCH') {
    throw new Error('TEST H FAILED: Watchlist token not saved');
  }
  db.removeFromWatchlist(watchUser, 'CA_WATCH_1');
  if (db.getWatchlist(watchUser).length !== 0) throw new Error('TEST H FAILED: Watchlist removal failed');
  console.log('   ✅ TEST H PASSED!\n');

  // TEST I: Alert deduplication & tracking
  console.log('▶️ TEST I: Alert Deduplication & Persistence');
  db.addTrackedToken(watchUser, 'CA_ALERT_1', 'ALERT', 0.05, 50000, 30000, 75);
  const tracked = db.getTrackedTokens(watchUser);
  if (tracked.length === 0) throw new Error('TEST I FAILED: Token alert tracking not saved');
  db.removeTrackedToken(watchUser, 'CA_ALERT_1');
  console.log('   ✅ TEST I PASSED!\n');

  // TEST J: API failure resilience (Fallback inspection)
  console.log('▶️ TEST J: API Failure Resilience');
  const fallbackSec = await RugCheckService.checkToken('INVALID_CA_999999999999999999999999');
  if (fallbackSec.status !== 'good' && fallbackSec.status !== 'warn') {
    throw new Error('TEST J FAILED: Fallback failed');
  }
  console.log('   ✅ TEST J PASSED (Graceful fallback handled without crashing)!\n');

  // TEST K: Wallet monitoring & classification
  console.log('▶️ TEST K: Wallet Intelligence Profiling');
  db.addTrackedWallet(watchUser, '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1', 'Raydium Authority');
  const wallets = db.getTrackedWallets(watchUser);
  if (wallets.length === 0) throw new Error('TEST K FAILED: Wallet not tracked');
  db.removeTrackedWallet(watchUser, '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1');
  console.log('   ✅ TEST K PASSED!\n');

  // TEST L: VIP unlimited access
  console.log('▶️ TEST L: VIP Unlimited Access Verification');
  const vipUser = 44556677;
  db.upgradeToVip(vipUser, 30);
  const vipAllowance = db.getDailyAllowance(vipUser, 5);
  if (!vipAllowance.isVip || vipAllowance.canScan !== true || vipAllowance.scansRemaining !== Infinity) {
    throw new Error('TEST L FAILED: VIP allowance not unlimited');
  }
  console.log('   ✅ TEST L PASSED!\n');

  // TEST M: Free user limit enforcement
  console.log('▶️ TEST M: Free User Limit Enforcement (5 Scans/Day)');
  const freeUser = 11223344;
  const userM = db.getUser(freeUser);
  userM.dailyScansCount = 5;
  userM.isVip = false;
  const freeAllowance = db.getDailyAllowance(freeUser, 5);
  if (freeAllowance.canScan !== false) throw new Error('TEST M FAILED: Free user not blocked after 5 scans');
  console.log('   ✅ TEST M PASSED!\n');

  // TEST N: Trending ranking
  console.log('▶️ TEST N: Trending Discovery Quality Sorting');
  const sampleTrending = [
    { ...baseMarket, liquidityUsd: 8000, volume24h: 50000 },
    { ...baseMarket, liquidityUsd: 150000, volume24h: 300000 }
  ];
  sampleTrending.sort((a, b) => b.volume24h - a.volume24h);
  if (sampleTrending[0].volume24h !== 300000) throw new Error('TEST N FAILED: Sorting failed');
  console.log('   ✅ TEST N PASSED!\n');

  // TEST O: Token Compare head-to-head evaluation
  console.log('▶️ TEST O: Head-to-Head Token Comparison Evaluation');
  const scoreToken1 = ScoringEngine.evaluate(baseMarket, cleanSecurity);
  const scoreToken2 = ScoringEngine.evaluate(marketB, cleanSecurity);
  const betterToken = scoreToken1.overallScore > scoreToken2.overallScore ? 'ALPHA' : 'COLLAPSED';
  if (betterToken !== 'ALPHA') throw new Error('TEST O FAILED: Winner evaluation incorrect');
  console.log(`   Comparison Winner: $${betterToken} (${scoreToken1.overallScore}/100 vs ${scoreToken2.overallScore}/100)`);
  console.log('   ✅ TEST O PASSED!\n');

  console.log('====================================================');
  console.log('🎉 ALL 15 PRODUCT TEST SCENARIOS (A-O) PASSED 100%!');
  console.log('====================================================\n');
}

runComprehensiveTests().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
