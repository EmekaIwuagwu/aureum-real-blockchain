#!/bin/bash

# Aureum Testnet Environment Setup
# Targeted for Ubuntu 22.04+ (Digital Ocean Droplets)

set -e

echo "🚀 Starting Aureum Setup..."

# 1. Update System
sudo apt update && sudo apt upgrade -y

# 2. Install Build Essentials
sudo apt install -y build-essential curl git git-lfs pkg-config libssl-dev

# 3. Install Rust
if ! command -v cargo &> /dev/null; then
    echo "🦀 Installing Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source $HOME/.cargo/env
else
    echo "✅ Rust already installed."
fi

# 4. Install Node.js & NPM (NodeSource v20)
if ! command -v node &> /dev/null; then
    echo "🟢 Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
else
    echo "✅ Node.js already installed."
fi

# 5. Install PM2 (Process Manager)
if ! command -v pm2 &> /dev/null; then
    echo "⚙️  Installing PM2..."
    sudo npm install -g pm2
else
    echo "✅ PM2 already installed."
fi

echo "✅ Environment Setup Complete!"
echo "Next: Run ./build.sh to compile the source code."
