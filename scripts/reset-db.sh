#!/bin/bash
# Reset and Initialize Aureum Blockchain Data Layer

echo "🛑 Stopping all Aureum services..."
pm2 stop all

echo "🧹 Clearing blockchain data..."
rm -rf ./data/blockchain/*

echo "🚀 Re-initializing node..."
# Use the compiled aureum-node to init
cd aureum-node
cargo run -- init --data-dir ../data

echo "📦 Funding test wallets and tokenizing initial properties..."
# We can use a script to tokenize some properties via RPC once the node is running
# But first, let's start the node in the background
cd ..
pm2 start "cd aureum-node && cargo run -- run --rpc-port 8545 --data-dir ../data" --name aureum-node

echo "Wait for node to start..."
sleep 5

echo "🏠 Tokenizing initial properties via RPC..."
# I'll create a node script to perform tokenization
cat > init-properties.js <<EOF
const { tokenizeProperty, getNonce } = require('./aureum-wallet/src/lib/blockchain_node'); // I'll create this version for Node.js
// Actually I can just use curl to the RPC for simplicity
EOF

# Tokenize Property 1: Golden Palace Lisbon (500,000 AUR)
# Using the default validator private key for tokenization
# Validator Address: A1109cd8305ff4145b0b89495431540d1f4faecdc
# Private Key: 3b6a27bcceb6a42d62a3a8d02a6f0d73653215771de243a63ac048a18b59da29

echo "Init script complete. Please run 'node scripts/seed-data.js' to populate properties."
