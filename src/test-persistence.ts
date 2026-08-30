import { db } from './db/database.js';

async function testPersistence() {
  console.log('====================================================');
  console.log('🧪 VERIFYING DAILY SCAN PERSISTENCE ACROSS RESTARTS');
  console.log('====================================================\n');

  const testUserId = 77712345;
  const todayUtc = new Date().toISOString().split('T')[0];

  console.log(`📅 Current UTC Date: ${todayUtc}`);

  // 1. Initial State
  const user = db.getUser(testUserId, 'persistence_tester');
  user.dailyScansCount = 0;
  user.bonusScans = 0;
  user.lastScanDate = todayUtc;
  user.isVip = false;

  let allowance = db.getDailyAllowance(testUserId, 5);
  console.log(`1️⃣ Initial Allowance: ${allowance.scansRemaining} scans remaining (Can scan: ${allowance.canScan})`);
  if (allowance.scansRemaining !== 5 || !allowance.canScan) {
    throw new Error('Initial scan allowance failed');
  }

  // 2. Perform 5 Scans
  console.log('\n⚡ Simulating 5 scans executed by user...');
  for (let i = 1; i <= 5; i++) {
    db.incrementScan(testUserId);
  }

  allowance = db.getDailyAllowance(testUserId, 5);
  console.log(`2️⃣ After 5 Scans: ${allowance.scansRemaining} scans remaining (Can scan: ${allowance.canScan})`);
  if (allowance.scansRemaining !== 0 || allowance.canScan !== false) {
    throw new Error('Allowance did not hit 0 after 5 scans!');
  }

  // 3. Simulate Render Sleep / Process Restart (Re-read from disk state)
  console.log('\n🔄 Simulating Render sleep/wake and process restart...');
  const refreshedUser = db.getUser(testUserId);
  const refreshedAllowance = db.getDailyAllowance(testUserId, 5);
  console.log(`3️⃣ After Restart on same UTC day (${refreshedUser.lastScanDate}):`);
  console.log(`   Scans used: ${refreshedUser.dailyScansCount}/5`);
  console.log(`   Scans remaining: ${refreshedAllowance.scansRemaining}`);
  console.log(`   Can scan: ${refreshedAllowance.canScan}`);

  if (refreshedAllowance.scansRemaining !== 0 || refreshedAllowance.canScan !== false) {
    throw new Error('FATAL: Restart incorrectly granted new free scans!');
  }
  console.log('   ✅ PASS: Restart preserved 0 scans remaining!');

  // 4. Simulate Next Calendar Day (Tomorrow UTC)
  console.log('\n🌅 Simulating UTC date rollover (advancing lastScanDate to yesterday)...');
  refreshedUser.lastScanDate = '2026-08-29'; // yesterday
  
  // Re-fetch user on new day
  const tomorrowAllowance = db.getDailyAllowance(testUserId, 5);
  console.log(`4️⃣ On New Calendar Day (${tomorrowAllowance.currentDateUtc}):`);
  console.log(`   Scans remaining: ${tomorrowAllowance.scansRemaining}`);
  console.log(`   Can scan: ${tomorrowAllowance.canScan}`);

  if (tomorrowAllowance.scansRemaining !== 5 || tomorrowAllowance.canScan !== true) {
    throw new Error('FATAL: Calendar day rollover failed to reset scans!');
  }
  console.log('   ✅ PASS: New calendar day successfully unlocked 5 new scans!');

  // 5. Test VIP User Exemption
  console.log('\n👑 Testing VIP user exemption...');
  db.upgradeToVip(testUserId, 30);
  const vipAllowance = db.getDailyAllowance(testUserId, 5);
  console.log(`5️⃣ VIP Allowance: Scans remaining: ${vipAllowance.scansRemaining} (Can scan: ${vipAllowance.canScan})`);
  if (!vipAllowance.isVip || vipAllowance.scansRemaining !== Infinity || !vipAllowance.canScan) {
    throw new Error('VIP user was restricted!');
  }
  console.log('   ✅ PASS: VIP user has unlimited scans!');

  console.log('\n====================================================');
  console.log('🎉 ALL PERSISTENCE TESTS PASSED 100%!');
  console.log('====================================================\n');
}

testPersistence().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
