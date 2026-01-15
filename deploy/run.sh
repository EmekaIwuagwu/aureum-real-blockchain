#!/bin/bash

# Aureum Testnet Run Script
echo "🌟 Starting Aureum Ecosystem..."

# 1. Initialize Node (Run only if data dir doesn't exist)
if [ ! -d "./data" ]; then
    echo "🆕 Initializing Chain Data..."
    ./aureum-node/target/release/aureum-node init --data-dir ./data
fi

# 2. Start all services via PM2
pm2 start deploy/ecosystem.config.js

echo "📊 Services started. Use 'pm2 list' or 'pm2 logs' to monitor."
echo "🔗 Wallet: http://YOUR_IP:3000"
echo "🔗 Explorer: http://YOUR_IP:3001"
