#!/bin/bash

# Aureum Testnet Build Script
set -e

BASE_DIR=$(pwd)

echo "🏗️  Building Aureum Node..."
cd "$BASE_DIR/aureum-node"
cargo build --release
echo "✅ Node Binary: ./aureum-node/target/release/aureum-node"

echo "📦 Installing Wallet Dependencies..."
cd "$BASE_DIR/aureum-wallet"
npm install

echo "📦 Installing Explorer Dependencies..."
cd "$BASE_DIR/aureum-explorer"
npm install

echo "🎉 Build Complete!"
echo "Next: Run ./run.sh to start the network."
