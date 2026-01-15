# Aureum Testnet: Digital Ocean Deployment Guide

This guide ensures you can deploy the Aureum Real Estate Blockchain on a Linux (Ubuntu) Droplet.

## 1. Prepare Your Droplet
- **OS**: Ubuntu 22.04 LTS or 24.04 LTS
- **Specs**: 4GB RAM / 2 vCPUs (Recommended)
- **Firewall**: Open ports `8545` (RPC), `3000` (Wallet), `3001` (Explorer).

## 2. Transfer Files
Upload the project folder to your droplet via SCP or Git:
```bash
git clone https://github.com/EmekaIwuagwu/aureum-real-blockchain.git
cd aureum-real-blockchain
```

## 3. Run Unified Installer
Everything is consolidated into a single installer script that handles system dependencies, Rust/NodeJS installation, building for production, and launching services.

```bash
chmod +x setup.sh
./setup.sh
```

The script will:
1. Detect your public IP for RPC communication.
2. Install Rust, Node.js, and PM2.
3. Build the Aureum Rust Node.
4. Build the Wallet and Explorer for **Production** (optimized for servers).
5. Initialize the blockchain data.
6. Launch all services via PM2.

## 4. Monitoring
Check the status of your live services:
```bash
pm2 list
pm2 logs aureum-node
pm2 logs aureum-wallet
pm2 logs aureum-explorer
```

## 5. Security & Access
- **Wallet**: `http://YOUR_SERVER_IP:3000`
- **Explorer**: `http://YOUR_SERVER_IP:3001`
- **RPC RPC**: `http://YOUR_SERVER_IP:8545`

Ensure your DigitalOcean Firewall or `ufw` allows incoming traffic on these three ports.
