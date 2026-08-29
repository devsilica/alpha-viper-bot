# 🐍 AlphaViper AI — Web3 Telegram AI Trading & Alpha Bot

AlphaViper AI is a high-speed Solana token security scanner, AI momentum predictor, and whale tracker built with **100% free-tier architecture** and direct **on-chain crypto monetization**.

---

## ⚡ Key Features

- **🔍 `/scan <ContractAddress>`**: Live DEX liquidity, volume, FDV, mint/freeze authority checks, LP lock status, and AI momentum scoring.
- **🔥 `/trending`**: Top 10 breakout Solana & pump.fun tokens filtered by minimum liquidity.
- **👛 `/track <WalletAddress> [Label]`**: Real-time whale transaction alerts sent directly to Telegram DMs.
- **⚡ Fast Buy Routing**: Instant Jupiter DEX 1-click swap links with your developer referral fee attached.
- **👑 On-Chain VIP Paywall (`/vip` & `/verify`)**: Collect `0.1 SOL` (~$20) directly to your non-custodial wallet with automated on-chain verification.

---

## 🚀 3-Minute Quickstart Guide

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment (`.env`)
Copy `.env.example` to `.env`:
```env
BOT_TOKEN=your_telegram_bot_token_from_botfather
TREASURY_WALLET_ADDRESS=your_phantom_or_solflare_solana_address
GEMINI_API_KEY=your_gemini_api_key_from_aistudio_google_com
VIP_PRICE_SOL=0.1
FREE_SCANS_LIMIT=5
ADMIN_TELEGRAM_IDS=your_telegram_user_id
```

### 3. Test Offline Engine (No Bot Token Needed!)
You can test the entire market data fetcher, RugCheck security analyzer, and AI reasoning engine immediately:
```bash
npm run test:scan
```

### 4. Start Live Telegram Bot
```bash
npm run dev
```

---

## 🌐 100% Free Hosting Deployment (Render.com)

1. Push your repository to **GitHub**.
2. Go to **[Render.com](https://render.com)** and create a new **Background Worker** or **Web Service**.
3. Set:
   - **Environment:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
4. Add your Environment Variables (`BOT_TOKEN`, `TREASURY_WALLET_ADDRESS`, `GEMINI_API_KEY`).
5. Click **Deploy** — your bot is now online 24/7 for **$0/month**!

---

## 💰 Monetization Channels

1. **VIP Subscriptions**: Users pay `0.1 SOL` via `/vip` to unlock unlimited scans and real-time whale alerts. The bot verifies the transaction on-chain automatically.
2. **Jupiter DEX Referral Fees**: Every swap executed through the bot sends `0.5% - 1%` fee directly to your `TREASURY_WALLET_ADDRESS`.
3. **Token Advertisements**: Charge token developers `$50–$150` in SOL/USDT to be featured in `/trending`.

---

## 🏦 Cash-Out Workflow (Nigeria / Africa)
1. Funds accumulate in your personal **Phantom / Solflare** wallet in SOL / USDC.
2. Transfer to **Binance / Bybit / Roqqu / YellowCard**.
3. Sell via **P2P** to receive instant Naira in your GTBank, Access, Kuda, or OPay account.
