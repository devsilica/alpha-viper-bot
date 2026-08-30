import { createClient } from '@supabase/supabase-js';
import { config } from './config/env.js';
import { db } from './db/database.js';

async function testSupabase() {
  console.log('====================================================');
  console.log('☁️ TESTING SUPABASE CLOUD CONNECTION');
  console.log('====================================================\n');

  console.log(`🔗 Supabase URL: ${config.SUPABASE_URL}`);
  if (!config.SUPABASE_URL || !config.SUPABASE_KEY) {
    console.error('❌ Supabase credentials missing in env!');
    process.exit(1);
  }

  const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_KEY);

  console.log('📡 1. Testing connection to table "alphaviper_state"...');
  const { data, error } = await supabase
    .from('alphaviper_state')
    .select('*')
    .limit(1);

  if (error) {
    console.error('⚠️ Supabase Query Error:', error.message);
    console.log('\n💡 If the table does not exist, run this in Supabase SQL Editor:');
    console.log(`
CREATE TABLE IF NOT EXISTS alphaviper_state (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
    `);
    process.exit(1);
  }

  console.log('✅ Connection successful! Found rows:', data?.length);

  console.log('\n💾 2. Performing sync of local database to Supabase...');
  const stats = db.getStats();
  console.log(`   Users to sync: ${stats.totalUsers}`);
  console.log(`   VIP Users: ${stats.vipUsersCount}`);
  console.log(`   Tracked Tokens: ${stats.totalTrackedTokens}`);

  // Trigger save which syncs to Supabase
  await (db as any).syncToCloud();

  console.log('\n📥 3. Verifying reading back state from Supabase Cloud...');
  const { data: cloudState, error: readErr } = await supabase
    .from('alphaviper_state')
    .select('data')
    .eq('id', 'main_state')
    .single();

  if (readErr || !cloudState?.data) {
    console.error('❌ Failed to read back state from Supabase:', readErr?.message);
    process.exit(1);
  }

  console.log('✅ Supabase State Verified:');
  console.log(`   Synced Users count: ${Object.keys(cloudState.data.users || {}).length}`);
  console.log(`   Synced Tracked Tokens: ${(cloudState.data.trackedTokens || []).length}`);

  console.log('\n====================================================');
  console.log('🎉 SUPABASE CLOUD DATABASE IS 100% OPERATIONAL!');
  console.log('====================================================\n');
}

testSupabase().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
