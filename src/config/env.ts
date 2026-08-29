import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  BOT_TOKEN: z.string().default(''),
  TREASURY_WALLET_ADDRESS: z.string().default('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
  GEMINI_API_KEY: z.string().default(''),
  SOLANA_RPC_URL: z.string().default('https://api.mainnet-beta.solana.com'),
  VIP_PRICE_SOL: z.coerce.number().default(0.1),
  FREE_SCANS_LIMIT: z.coerce.number().default(5),
  ADMIN_TELEGRAM_IDS: z.string().default('')
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.warn('⚠️ Some environment variables are missing, using defaults:', parsed.error.format());
}

export const config = parsed.success ? parsed.data : {
  BOT_TOKEN: process.env.BOT_TOKEN || '',
  TREASURY_WALLET_ADDRESS: process.env.TREASURY_WALLET_ADDRESS || 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  SOLANA_RPC_URL: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  VIP_PRICE_SOL: Number(process.env.VIP_PRICE_SOL) || 0.1,
  FREE_SCANS_LIMIT: Number(process.env.FREE_SCANS_LIMIT) || 5,
  ADMIN_TELEGRAM_IDS: process.env.ADMIN_TELEGRAM_IDS || ''
};

export const isAdmin = (userId: number | string): boolean => {
  if (!config.ADMIN_TELEGRAM_IDS) return false;
  const adminIds = config.ADMIN_TELEGRAM_IDS.split(',').map(id => id.trim());
  return adminIds.includes(String(userId));
};
