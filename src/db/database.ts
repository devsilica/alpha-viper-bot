import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config/env.js';

export interface UserRecord {
  telegramId: number;
  username?: string;
  isVip: boolean;
  vipExpiresAt?: number; // timestamp in ms
  dailyScansCount: number;
  bonusScans: number;
  lastScanDate: string; // YYYY-MM-DD in UTC
  lastScanTimestamp?: number; // timestamp in ms of last scan
  referredBy?: number;
  referralCount: number;
  referralEarningsSol: number;
  createdAt: number;
}

export interface TrackedWallet {
  userId: number;
  walletAddress: string;
  label?: string;
  addedAt: number;
  lastSignature?: string;
}

export interface TrackedTokenAlert {
  userId: number;
  tokenAddress: string;
  symbol: string;
  lastPriceUsd: number;
  lastVolume24h: number;
  lastLiquidityUsd: number;
  lastRiskScore: number;
  lastAlertAt?: number;
  addedAt: number;
}

export interface WatchlistToken {
  userId: number;
  tokenAddress: string;
  symbol: string;
  name: string;
  priceUsd: string;
  liquidityUsd: number;
  score: number;
  priceChange24h: number;
  addedAt: number;
}

export interface TokenScanSnapshot {
  tokenAddress: string;
  symbol: string;
  priceUsd: string;
  liquidityUsd: number;
  volume24h: number;
  topHoldersPct: number;
  largestHolderPct: number;
  buySellRatio24h: number;
  priceChange24h: number;
  overallScore: number;
  scannedAt: number;
}

export interface TokenDeltaChange {
  timeDiffFormatted: string;
  priceDiffPct: number;
  priceFormatted: string;
  liquidityDiffUsd: number;
  liquidityFormatted: string;
  topHoldersDiffPct: number;
  topHoldersFormatted: string;
  flowDiffRatio: number;
  flowFormatted: string;
  scoreDiff: number;
  scoreFormatted: string;
  interpretation: string;
}

export interface PaymentRecord {
  signature: string;
  telegramId: number;
  amountSol: number;
  verifiedAt: number;
}

interface DatabaseSchema {
  users: Record<number, UserRecord>;
  trackedWallets: TrackedWallet[];
  trackedTokens: TrackedTokenAlert[];
  watchlistTokens: WatchlistToken[];
  scanSnapshots: Record<string, TokenScanSnapshot>;
  payments: PaymentRecord[];
}

export interface DailyAllowanceInfo {
  isVip: boolean;
  vipExpiresAt?: number;
  dailyScansCount: number;
  bonusScans: number;
  dailyLimit: number;
  scansRemaining: number;
  canScan: boolean;
  currentDateUtc: string;
  lastScanDate: string;
}

const DB_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DB_DIR, 'db.json');
const DB_TMP_FILE = path.join(DB_DIR, 'db.json.tmp');

class LocalDatabase {
  private data: DatabaseSchema = {
    users: {},
    trackedWallets: [],
    trackedTokens: [],
    watchlistTokens: [],
    scanSnapshots: {},
    payments: []
  };

  private supabase: SupabaseClient | null = null;
  private isCloudConfigured: boolean = false;

  constructor() {
    if (config.SUPABASE_URL && config.SUPABASE_KEY) {
      try {
        this.supabase = createClient(config.SUPABASE_URL, config.SUPABASE_KEY);
        this.isCloudConfigured = true;
      } catch (err) {
        console.warn('⚠️ Supabase client initialization error:', err);
      }
    } else if (config.UPSTASH_REDIS_REST_URL && config.UPSTASH_REDIS_REST_TOKEN) {
      this.isCloudConfigured = true;
    }

    this.init();
  }

  private async init() {
    try {
      if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        this.data = {
          users: parsed.users || {},
          trackedWallets: parsed.trackedWallets || [],
          trackedTokens: parsed.trackedTokens || [],
          watchlistTokens: parsed.watchlistTokens || [],
          scanSnapshots: parsed.scanSnapshots || {},
          payments: parsed.payments || []
        };
      }

      if (this.isCloudConfigured) {
        await this.syncFromCloud();
      } else {
        this.saveLocal();
      }
    } catch (err) {
      console.error('Failed to initialize database:', err);
    }
  }

  public async syncFromCloud(): Promise<void> {
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('alphaviper_state')
          .select('data')
          .eq('id', 'main_state')
          .single();

        if (!error && data && data.data) {
          const parsed = data.data as Partial<DatabaseSchema>;
          this.data = {
            users: { ...this.data.users, ...(parsed.users || {}) },
            trackedWallets: parsed.trackedWallets || this.data.trackedWallets,
            trackedTokens: parsed.trackedTokens || this.data.trackedTokens,
            watchlistTokens: parsed.watchlistTokens || this.data.watchlistTokens,
            scanSnapshots: parsed.scanSnapshots || this.data.scanSnapshots,
            payments: parsed.payments || this.data.payments
          };
          this.saveLocal();
          console.log('⚡ Database successfully synced from Supabase Cloud!');
          return;
        }
      } catch (err: any) {
        console.warn('⚠️ Supabase sync note:', err.message);
      }
    }

    if (config.UPSTASH_REDIS_REST_URL && config.UPSTASH_REDIS_REST_TOKEN) {
      try {
        const response = await axios.get(`${config.UPSTASH_REDIS_REST_URL}/get/alphaviper_database`, {
          headers: { Authorization: `Bearer ${config.UPSTASH_REDIS_REST_TOKEN}` },
          timeout: 5000
        });

        if (response.data && response.data.result) {
          const rawCloudData = response.data.result;
          const parsed = typeof rawCloudData === 'string' ? JSON.parse(rawCloudData) : rawCloudData;
          this.data = {
            users: { ...this.data.users, ...(parsed.users || {}) },
            trackedWallets: parsed.trackedWallets || this.data.trackedWallets,
            trackedTokens: parsed.trackedTokens || this.data.trackedTokens,
            watchlistTokens: parsed.watchlistTokens || this.data.watchlistTokens,
            scanSnapshots: parsed.scanSnapshots || this.data.scanSnapshots,
            payments: parsed.payments || this.data.payments
          };
          this.saveLocal();
          console.log('☁️ Database successfully synced from Upstash Cloud!');
        }
      } catch (err: any) {
        console.warn('⚠️ Upstash sync skipped:', err.message);
      }
    }
  }

  private async syncToCloud(): Promise<void> {
    if (this.supabase) {
      try {
        await this.supabase.from('alphaviper_state').upsert({
          id: 'main_state',
          data: this.data,
          updated_at: new Date().toISOString()
        });
      } catch (err: any) {
        console.warn('⚠️ Supabase cloud save warning:', err.message);
      }
    }

    if (config.UPSTASH_REDIS_REST_URL && config.UPSTASH_REDIS_REST_TOKEN) {
      try {
        const jsonContent = JSON.stringify(this.data);
        await axios.post(
          `${config.UPSTASH_REDIS_REST_URL}/set/alphaviper_database`,
          jsonContent,
          {
            headers: {
              Authorization: `Bearer ${config.UPSTASH_REDIS_REST_TOKEN}`,
              'Content-Type': 'application/json'
            },
            timeout: 5000
          }
        );
      } catch (err: any) {
        console.warn('⚠️ Upstash cloud save warning:', err.message);
      }
    }
  }

  private saveLocal() {
    try {
      if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
      }
      const jsonContent = JSON.stringify(this.data, null, 2);
      fs.writeFileSync(DB_TMP_FILE, jsonContent, 'utf-8');
      fs.renameSync(DB_TMP_FILE, DB_FILE);
    } catch (err) {
      console.error('Failed to persist database file locally:', err);
    }
  }

  private save() {
    this.saveLocal();
    if (this.isCloudConfigured) {
      this.syncToCloud().catch(() => {});
    }
  }

  public getTodayDateUtcStr(): string {
    return new Date().toISOString().split('T')[0];
  }

  public getUser(telegramId: number, username?: string): UserRecord {
    const todayUtc = this.getTodayDateUtcStr();
    let user = this.data.users[telegramId];

    if (!user) {
      user = {
        telegramId,
        username,
        isVip: false,
        dailyScansCount: 0,
        bonusScans: 0,
        lastScanDate: todayUtc,
        referralCount: 0,
        referralEarningsSol: 0,
        createdAt: Date.now()
      };
      this.data.users[telegramId] = user;
      this.save();
      return user;
    }

    if (username && user.username !== username) {
      user.username = username;
    }

    if (user.lastScanDate !== todayUtc) {
      user.dailyScansCount = 0;
      user.lastScanDate = todayUtc;
      this.save();
    }

    if (user.isVip && user.vipExpiresAt && user.vipExpiresAt < Date.now()) {
      user.isVip = false;
      this.save();
    }

    return user;
  }

  public getDailyAllowance(telegramId: number, freeLimit: number = 5): DailyAllowanceInfo {
    const todayUtc = this.getTodayDateUtcStr();
    const user = this.getUser(telegramId);

    const isVipActive = user.isVip && (!user.vipExpiresAt || user.vipExpiresAt > Date.now());
    const scansRemainingToday = Math.max(0, freeLimit - user.dailyScansCount) + (user.bonusScans || 0);
    const canScan = isVipActive || scansRemainingToday > 0;

    return {
      isVip: isVipActive,
      vipExpiresAt: user.vipExpiresAt,
      dailyScansCount: user.dailyScansCount,
      bonusScans: user.bonusScans || 0,
      dailyLimit: freeLimit,
      scansRemaining: isVipActive ? Infinity : scansRemainingToday,
      canScan,
      currentDateUtc: todayUtc,
      lastScanDate: user.lastScanDate
    };
  }

  public incrementScan(telegramId: number): UserRecord {
    const user = this.getUser(telegramId);
    const todayUtc = this.getTodayDateUtcStr();

    user.lastScanDate = todayUtc;
    user.lastScanTimestamp = Date.now();

    if (user.bonusScans > 0) {
      user.bonusScans -= 1;
    } else {
      user.dailyScansCount += 1;
    }

    this.save();
    return user;
  }

  public registerReferral(newUserId: number, referrerId: number): boolean {
    if (newUserId === referrerId) return false;
    const user = this.getUser(newUserId);
    if (user.referredBy) return false;

    const referrer = this.getUser(referrerId);
    user.referredBy = referrerId;
    referrer.referralCount += 1;
    referrer.bonusScans = (referrer.bonusScans || 0) + 5;

    this.save();
    return true;
  }

  public upgradeToVip(telegramId: number, days: number = 30): UserRecord {
    const user = this.getUser(telegramId);
    const durationMs = days * 24 * 60 * 60 * 1000;
    
    user.isVip = true;
    user.vipExpiresAt = (user.vipExpiresAt && user.vipExpiresAt > Date.now())
      ? user.vipExpiresAt + durationMs
      : Date.now() + durationMs;
      
    if (user.referredBy) {
      const referrer = this.getUser(user.referredBy);
      referrer.referralEarningsSol = (referrer.referralEarningsSol || 0) + 0.02;
    }

    this.save();
    return user;
  }

  public addPayment(signature: string, telegramId: number, amountSol: number): boolean {
    const existing = this.data.payments.find(p => p.signature === signature);
    if (existing) return false;

    this.data.payments.push({
      signature,
      telegramId,
      amountSol,
      verifiedAt: Date.now()
    });
    this.save();
    return true;
  }

  public isSignatureUsed(signature: string): boolean {
    return this.data.payments.some(p => p.signature === signature);
  }

  // ==========================================
  // TOKEN DELTA & CHANGE INTELLIGENCE
  // ==========================================

  public saveScanSnapshot(snapshot: TokenScanSnapshot): TokenDeltaChange | null {
    const key = snapshot.tokenAddress.toLowerCase();
    const prev = this.data.scanSnapshots[key];

    // Save/update snapshot
    this.data.scanSnapshots[key] = snapshot;
    this.save();

    if (!prev) return null;

    const ageMs = snapshot.scannedAt - prev.scannedAt;
    const mins = Math.floor(ageMs / 60000);
    const hours = Math.floor(mins / 60);
    const timeDiffFormatted = hours > 0 ? `${hours}h ${mins % 60}m ago` : `${Math.max(1, mins)}m ago`;

    const prevPrice = Number(prev.priceUsd) || 0;
    const currPrice = Number(snapshot.priceUsd) || 0;
    const priceDiffPct = prevPrice > 0 ? Number((((currPrice - prevPrice) / prevPrice) * 100).toFixed(1)) : 0;
    const priceFormatted = `${prev.priceUsd} → ${snapshot.priceUsd} (${priceDiffPct >= 0 ? '+' : ''}${priceDiffPct}%)`;

    const liqDiffUsd = snapshot.liquidityUsd - prev.liquidityUsd;
    const liqFormatted = `$${Math.round(prev.liquidityUsd).toLocaleString()} → $${Math.round(snapshot.liquidityUsd).toLocaleString()} (${liqDiffUsd >= 0 ? '+' : ''}$${Math.round(liqDiffUsd).toLocaleString()})`;

    const topHoldersDiff = Number((snapshot.topHoldersPct - prev.topHoldersPct).toFixed(1));
    const topHoldersFormatted = `${prev.topHoldersPct}% → ${snapshot.topHoldersPct}% (${topHoldersDiff >= 0 ? '+' : ''}${topHoldersDiff}%)`;

    const flowDiff = Number((snapshot.buySellRatio24h - prev.buySellRatio24h).toFixed(2));
    const flowFormatted = `${prev.buySellRatio24h}:1 → ${snapshot.buySellRatio24h}:1 (${flowDiff >= 0 ? '+' : ''}${flowDiff})`;

    const scoreDiff = snapshot.overallScore - prev.overallScore;
    const scoreFormatted = `${prev.overallScore} → ${snapshot.overallScore} (${scoreDiff >= 0 ? '+' : ''}${scoreDiff})`;

    let interpretation = 'Parameters remained relatively stable since last scan.';
    if (scoreDiff >= 10 || (liqDiffUsd > 10000 && flowDiff > 0.3)) {
      interpretation = 'Risk profile materially improved: Increased buy pressure and expanding liquidity pool.';
    } else if (scoreDiff <= -10 || (liqDiffUsd < -10000 && flowDiff < -0.3)) {
      interpretation = 'Risk profile deteriorated: Increased selling pressure and weakening liquidity support.';
    } else if (priceDiffPct > 20) {
      interpretation = 'Strong short-term price expansion with active volume flow.';
    }

    return {
      timeDiffFormatted,
      priceDiffPct,
      priceFormatted,
      liquidityDiffUsd: liqDiffUsd,
      liquidityFormatted: liqFormatted,
      topHoldersDiffPct: topHoldersDiff,
      topHoldersFormatted,
      flowDiffRatio: flowDiff,
      flowFormatted,
      scoreDiff,
      scoreFormatted,
      interpretation
    };
  }

  // ==========================================
  // TOKEN WATCHLIST
  // ==========================================

  public addToWatchlist(
    userId: number,
    tokenAddress: string,
    symbol: string,
    name: string,
    priceUsd: string,
    liquidityUsd: number,
    score: number,
    priceChange24h: number
  ): boolean {
    const key = tokenAddress.toLowerCase();
    const exists = this.data.watchlistTokens.some(
      w => w.userId === userId && w.tokenAddress.toLowerCase() === key
    );
    if (exists) return false;

    this.data.watchlistTokens.push({
      userId,
      tokenAddress,
      symbol,
      name,
      priceUsd,
      liquidityUsd,
      score,
      priceChange24h,
      addedAt: Date.now()
    });
    this.save();
    return true;
  }

  public removeFromWatchlist(userId: number, tokenAddress: string): boolean {
    const key = tokenAddress.toLowerCase();
    const initialLen = this.data.watchlistTokens.length;
    this.data.watchlistTokens = this.data.watchlistTokens.filter(
      w => !(w.userId === userId && w.tokenAddress.toLowerCase() === key)
    );
    if (this.data.watchlistTokens.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  public getWatchlist(userId: number): WatchlistToken[] {
    return this.data.watchlistTokens.filter(w => w.userId === userId);
  }

  // ==========================================
  // TRACKED WALLETS
  // ==========================================

  public addTrackedWallet(userId: number, walletAddress: string, label?: string, initialSignature?: string): boolean {
    const exists = this.data.trackedWallets.some(
      tw => tw.userId === userId && tw.walletAddress.toLowerCase() === walletAddress.toLowerCase()
    );
    if (exists) return false;

    this.data.trackedWallets.push({
      userId,
      walletAddress,
      label,
      addedAt: Date.now(),
      lastSignature: initialSignature
    });
    this.save();
    return true;
  }

  public updateTrackedWalletSignature(walletAddress: string, signature: string): void {
    let updated = false;
    for (const tw of this.data.trackedWallets) {
      if (tw.walletAddress.toLowerCase() === walletAddress.toLowerCase()) {
        tw.lastSignature = signature;
        updated = true;
      }
    }
    if (updated) this.save();
  }

  public removeTrackedWallet(userId: number, walletAddress: string): boolean {
    const initialLen = this.data.trackedWallets.length;
    this.data.trackedWallets = this.data.trackedWallets.filter(
      tw => !(tw.userId === userId && tw.walletAddress.toLowerCase() === walletAddress.toLowerCase())
    );
    if (this.data.trackedWallets.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  public getTrackedWallets(userId?: number): TrackedWallet[] {
    if (userId) {
      return this.data.trackedWallets.filter(tw => tw.userId === userId);
    }
    return this.data.trackedWallets;
  }

  // ==========================================
  // TRACKED TOKENS (VIP EARLY-WARNING SYSTEM)
  // ==========================================

  public addTrackedToken(
    userId: number,
    tokenAddress: string,
    symbol: string,
    initialPriceUsd: number,
    initialVolume24h: number,
    initialLiquidityUsd: number,
    initialRiskScore: number
  ): boolean {
    const exists = this.data.trackedTokens.some(
      tt => tt.userId === userId && tt.tokenAddress.toLowerCase() === tokenAddress.toLowerCase()
    );
    if (exists) return false;

    this.data.trackedTokens.push({
      userId,
      tokenAddress,
      symbol,
      lastPriceUsd: initialPriceUsd,
      lastVolume24h: initialVolume24h,
      lastLiquidityUsd: initialLiquidityUsd,
      lastRiskScore: initialRiskScore,
      addedAt: Date.now()
    });
    this.save();
    return true;
  }

  public removeTrackedToken(userId: number, tokenAddress: string): boolean {
    const initialLen = this.data.trackedTokens.length;
    this.data.trackedTokens = this.data.trackedTokens.filter(
      tt => !(tt.userId === userId && tt.tokenAddress.toLowerCase() === tokenAddress.toLowerCase())
    );
    if (this.data.trackedTokens.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  public updateTrackedTokenSnapshot(
    tokenAddress: string,
    priceUsd: number,
    volume24h: number,
    liquidityUsd: number,
    riskScore: number,
    alerted: boolean = false
  ): void {
    let updated = false;
    for (const tt of this.data.trackedTokens) {
      if (tt.tokenAddress.toLowerCase() === tokenAddress.toLowerCase()) {
        tt.lastPriceUsd = priceUsd;
        tt.lastVolume24h = volume24h;
        tt.lastLiquidityUsd = liquidityUsd;
        tt.lastRiskScore = riskScore;
        if (alerted) {
          tt.lastAlertAt = Date.now();
        }
        updated = true;
      }
    }
    if (updated) this.save();
  }

  public getTrackedTokens(userId?: number): TrackedTokenAlert[] {
    if (userId) {
      return this.data.trackedTokens.filter(tt => tt.userId === userId);
    }
    return this.data.trackedTokens;
  }

  public getStats() {
    const allUsers = Object.values(this.data.users);
    const now = Date.now();
    const vipUsers = allUsers.filter(u => u.isVip && (!u.vipExpiresAt || u.vipExpiresAt > now));
    const totalSolCollected = this.data.payments.reduce((acc, p) => acc + p.amountSol, 0);
    const totalReferrals = allUsers.reduce((acc, u) => acc + (u.referralCount || 0), 0);

    return {
      totalUsers: allUsers.length,
      vipUsersCount: vipUsers.length,
      totalPayments: this.data.payments.length,
      totalSolCollected,
      totalTrackedWallets: this.data.trackedWallets.length,
      totalTrackedTokens: this.data.trackedTokens.length,
      totalWatchlistTokens: this.data.watchlistTokens.length,
      totalReferrals
    };
  }
}

export const db = new LocalDatabase();
