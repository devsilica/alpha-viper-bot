import fs from 'fs';
import path from 'path';

export interface UserRecord {
  telegramId: number;
  username?: string;
  isVip: boolean;
  vipExpiresAt?: number; // timestamp in ms
  dailyScansCount: number;
  lastScanDate: string; // YYYY-MM-DD
  createdAt: number;
}

export interface TrackedWallet {
  userId: number;
  walletAddress: string;
  label?: string;
  addedAt: number;
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
  payments: PaymentRecord[];
}

const DB_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DB_DIR, 'db.json');

class LocalDatabase {
  private data: DatabaseSchema = {
    users: {},
    trackedWallets: [],
    payments: []
  };

  constructor() {
    this.init();
  }

  private init() {
    try {
      if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        this.data = JSON.parse(raw);
      } else {
        this.save();
      }
    } catch (err) {
      console.error('Failed to initialize local DB:', err);
    }
  }

  private save() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to persist local DB:', err);
    }
  }

  private getTodayDateStr(): string {
    return new Date().toISOString().split('T')[0];
  }

  public getUser(telegramId: number, username?: string): UserRecord {
    const today = this.getTodayDateStr();
    let user = this.data.users[telegramId];

    if (!user) {
      user = {
        telegramId,
        username,
        isVip: false,
        dailyScansCount: 0,
        lastScanDate: today,
        createdAt: Date.now()
      };
      this.data.users[telegramId] = user;
      this.save();
      return user;
    }

    // Reset daily count if date has changed
    if (user.lastScanDate !== today) {
      user.dailyScansCount = 0;
      user.lastScanDate = today;
      this.save();
    }

    // Check VIP expiration
    if (user.isVip && user.vipExpiresAt && user.vipExpiresAt < Date.now()) {
      user.isVip = false;
      this.save();
    }

    return user;
  }

  public incrementScan(telegramId: number): UserRecord {
    const user = this.getUser(telegramId);
    user.dailyScansCount += 1;
    this.save();
    return user;
  }

  public upgradeToVip(telegramId: number, days: number = 30): UserRecord {
    const user = this.getUser(telegramId);
    const durationMs = days * 24 * 60 * 60 * 1000;
    
    user.isVip = true;
    user.vipExpiresAt = (user.vipExpiresAt && user.vipExpiresAt > Date.now())
      ? user.vipExpiresAt + durationMs
      : Date.now() + durationMs;
      
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

  public addTrackedWallet(userId: number, walletAddress: string, label?: string): boolean {
    const exists = this.data.trackedWallets.some(
      tw => tw.userId === userId && tw.walletAddress.toLowerCase() === walletAddress.toLowerCase()
    );
    if (exists) return false;

    this.data.trackedWallets.push({
      userId,
      walletAddress,
      label,
      addedAt: Date.now()
    });
    this.save();
    return true;
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

  public getStats() {
    const allUsers = Object.values(this.data.users);
    const now = Date.now();
    const vipUsers = allUsers.filter(u => u.isVip && (!u.vipExpiresAt || u.vipExpiresAt > now));
    const totalSolCollected = this.data.payments.reduce((acc, p) => acc + p.amountSol, 0);

    return {
      totalUsers: allUsers.length,
      vipUsersCount: vipUsers.length,
      totalPayments: this.data.payments.length,
      totalSolCollected,
      totalTrackedWallets: this.data.trackedWallets.length
    };
  }
}

export const db = new LocalDatabase();
