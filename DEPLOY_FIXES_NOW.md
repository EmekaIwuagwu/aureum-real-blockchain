# DEPLOYMENT INSTRUCTIONS - Critical Fixes Applied

## What Was Fixed:
1. ✅ **Explorer Auto-Connect** - Now automatically detects your server IP (139.59.214.243:8545)
2. ✅ **Transaction Display** - Wallet now fetches transactions from last 20 blocks  
3. ✅ **Live Status Updates** - Explorer will show real-time block/transaction data

## Deploy to DigitalOcean:

### SSH into your droplet and run:

```bash
cd ~/aureum-real-blockchain

# Pull latest fixes
git pull origin main

# Rebuild Explorer (CRITICAL - this has the localhost fix)
cd aureum-explorer
npm install
npm run build

# Rebuild Wallet (CRITICAL - this has the transaction display fix)
cd ../aureum-wallet
npm install
npm run build

# Restart all services
cd ..
pm2 restart all
pm2 logs
```

### After Restart:

1. **Open Explorer:** `http://139.59.214.243:3001`
   - Should show "OPERATIONAL" instead of "OFFLINE"
   - Should display blocks and transactions immediately
   
2. **Open Wallet:** `http://139.59.214.243:3000`
   - Should show your 500,000 AUR balance
   - Should display your funding transaction in "Recent Activity"

3. **If Explorer still shows offline:**
   - Look for a small gear icon (⚙️) near "Node Offline/Connecting..."
   - Click it to open Network Settings
   - Enter: `http://139.59.214.243:8545`
   - Click "Save & Reconnect"

## Verification Checklist:

- [ ] Explorer shows "OPERATIONAL" status
- [ ] Explorer displays blocks and transactions
- [ ] Wallet shows 500,000 AUR balance
- [ ] Wallet displays funding transaction
- [ ] Both apps auto-refresh data every 3-5 seconds

## If Issues Persist:

Run this to check if the node is actually running:
```bash
pm2 list
curl http://localhost:8545 -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"aureum_getLatestBlock","params":[],"id":1}'
```

Expected: You should see JSON with block data, not a connection error.
