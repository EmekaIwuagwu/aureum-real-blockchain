#!/bin/bash

# Aureum Blockchain - Unified Setup & Production Installer
# Optimized for Ubuntu 22.04+ (DigitalOcean Droplets)

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🌟 Aureum Blockchain: Unified Setup & Production Installer${NC}"

# Detect Public IP
PUBLIC_IP=$(curl -s https://api.ipify.org || echo "localhost")
echo -e "Detected IP: ${GREEN}${PUBLIC_IP}${NC}"

# 1. Environment Setup
echo -e "\n${BLUE}Step 1: Installing System Dependencies...${NC}"
sudo apt update
sudo apt install -y build-essential curl git git-lfs pkg-config libssl-dev

# 2. Rust Setup
if ! command -v cargo &> /dev/null; then
    echo -e "${RED}Rust not found. Installing...${NC}"
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source $HOME/.cargo/env
else
    echo -e "${GREEN}✅ Rust is installed.${NC}"
fi

# 3. Node.js Setup (NodeSource v20)
if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js not found. Installing Node.js v20...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
else
    echo -e "${GREEN}✅ Node.js $(node -v) is installed.${NC}"
fi

# 4. PM2 Setup
if ! command -v pm2 &> /dev/null; then
    echo -e "${RED}PM2 not found. Installing globally...${NC}"
    sudo npm install -g pm2
else
    echo -e "${GREEN}✅ PM2 is installed.${NC}"
fi

# 5. Build Aureum Node
echo -e "\n${BLUE}Step 2: Building Aureum Node...${NC}"
cd aureum-node
cargo build --release
cd ..
echo -e "${GREEN}✅ Aureum Node built.${NC}"

# 6. Build Frontend Applications (Production Mode)
echo -e "\n${BLUE}Step 3: Building Frontend Apps (this may take a few minutes)...${NC}"

# Set Environment Variables for Build
export NEXT_PUBLIC_RPC_URL="http://${PUBLIC_IP}:8545"

echo "Building Wallet..."
cd aureum-wallet
npm install
npm run build
cd ..

echo "Building Explorer..."
cd aureum-explorer
npm install
npm run build
cd ..

# 7. Initialize Chain Data
echo -e "\n${BLUE}Step 4: Initializing Chain Data...${NC}"
if [ ! -d "./data" ]; then
    ./aureum-node/target/release/aureum-node init --data-dir ./data
else
    echo "Data directory already exists. Skipping init."
fi

# 8. Launch with PM2
echo -e "\n${BLUE}Step 5: Launching Ecosystem...${NC}"
pm2 delete all || true
pm2 start deploy/ecosystem.config.js

echo -e "\n${BLUE}--------------------------------------------------${NC}"
echo -e "🚀 ${GREEN}Aureum Blockchain is LIVE!${NC}"
echo -e "🔗 ${BLUE}Wallet:${NC}   http://${PUBLIC_IP}:3000"
echo -e "🔗 ${BLUE}Explorer:${NC} http://${PUBLIC_IP}:3001"
echo -e "🔗 ${BLUE}RPC Node:${NC} http://${PUBLIC_IP}:8545"
echo -e "${BLUE}--------------------------------------------------${NC}"
echo -e "Monitor logs with: ${GREEN}pm2 logs${NC}"
echo -e "Check status with: ${GREEN}pm2 list${NC}"
echo -e "Ensure ports 3000, 3001, and 8545 are open in your firewall."
