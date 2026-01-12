# Aureum Wallet - Chrome Extension & Web App Guide

## 🎯 Dual Deployment Strategy

The Aureum Wallet is designed to work as **BOTH** a Chrome Extension and a standalone Web Application!

---

## 🌐 Current Status: Web App (Running)

Your wallet is already a fully functional **Next.js web application** running on:
- **http://localhost:3000** (development)
- Can be deployed to Vercel, Netlify, or any static hosting

---

## 🧩 Converting to Chrome Extension

### Step 1: Create Manifest File

Create `aureum-wallet/public/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "Aureum Wallet - Luxury Real Estate Blockchain",
  "version": "1.0.0",
  "description": "Bespoke blockchain wallet for luxury real estate tokenization",
  "permissions": [
    "storage",
    "activeTab"
  ],
  "action": {
    "default_popup": "index.html",
    "default_icon": {
      "16": "assets/logo.png",
      "48": "assets/logo.png",
      "128": "assets/logo.png"
    }
  },
  "icons": {
    "16": "assets/logo.png",
    "48": "assets/logo.png",
    "128": "assets/logo.png"
  },
  "content_security_policy": {
   "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
  }
}
```

### Step 2: Build for Extension

```bash
npm run build
```

This creates an optimized `out/` directory with static files.

### Step 3: Update Next.js Config

Update `next.config.ts`:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export', // Enable static export for Chrome Extension
  images: {
    unoptimized: true, // Required for static export
  },
  assetPrefix: './', // Use relative paths
};

export default nextConfig;
```

### Step 4: Load in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (top right toggle)
3. Click **"Load unpacked"**
4. Select the `out/` folder from your build
5. Your Aureum Wallet extension is now live! 🎉

---

## 🚀 Recommended Deployment Strategy

### Option A: Dual Mode (Best of Both Worlds)
- **Chrome Extension**: For users who want quick access via browser toolbar
- **Web App**: For users who prefer traditional web access
- Deploy web app to Vercel: `npm run build && vercel deploy`

### Option B: Extension-Only
- Build and publish to Chrome Web Store
- Users install via: [chrome.google.com/webstore](https://chrome.google.com/webstore)

### Option C: Web App Only
- Deploy to Vercel/Netlify
- Users access via URL
- Can add to mobile home screen as PWA

---

## 📦 Publishing to Chrome Web Store

1. **Create Developer Account**: https://chrome.google.com/webstore/devconsole
2. **Package Extension**: Zip the `out/` folder
3. **Upload to Store**: Pay $5 one-time fee
4. **Wait for Review**: Usually 1-3 days
5. **Live!**: Users can install from Chrome Web Store

---

## 🔒 Extension-Specific Features

When running as an extension, you can add:

```typescript
// Check if running as extension
const isExtension = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;

if (isExtension) {
  // Use Chrome Storage API instead of localStorage
  chrome.storage.local.set({ walletAddress: address });
  
  // Inject web3 provider into websites (like MetaMask)
  window.aureum = {
    isAureum: true,
    sendTransaction: async (tx) => {
      // Handle transactions
    }
  };
}
```

---

## ⚡ Performance Comparison

| Feature | Web App | Chrome Extension |
|---------|---------|------------------|
| Installation | No install needed | One-click install |
| Access | Browser URL | Browser toolbar icon |
| Storage | localStorage | chrome.storage (synced across devices!) |
| Speed | Fast | Faster (cached locally) |
| Updates | Instant (refresh) | Auto-updates |
| Mobile | ✅ Responsive | ❌ Desktop only |

---

## 🎨 Current Features (Both Platforms)

- ✅ Create/Import Wallet
- ✅ View Balance & Assets
- ✅ Send/Receive AUR tokens
- ✅ Real Estate Marketplace
- ✅ Property Purchase (Pay to Escrow)
- ✅ Transaction History
- ✅ Password-Protected Private Key Export
- ✅ QR Code Generation
- ✅ Security Warnings

---

## 📝 Next Steps

1. **Test web app thoroughly** (already running!)
2. **Create manifest.json** when ready for extension
3. **Build with `npm run build`**
4. **Test extension locally** in Chrome
5. **Decide**: Publish to Chrome Web Store, deploy as web app, or both!

---

**Recommendation**: Keep it as a **Web App** for now (easier to iterate and update). Once stable, package as Chrome Extension for maximum reach!
