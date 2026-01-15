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

## 3. Run Deployment Scripts
Make the scripts executable and run them in order:

### A. Environment Setup
Installs Rust, Node.js, and PM2.
```bash
chmod +x deploy/*.sh
./deploy/install.sh
```

### B. Build Everything
Compiles the Rust node and installs frontend dependencies.
```bash
./deploy/build.sh
```

### C. Launch
Starts the Node, Wallet, and Explorer in the background.
```bash
./deploy/run.sh
```

## 4. Monitoring
Check the status of your services:
```bash
pm2 list
pm2 logs aureum-node
pm2 logs aureum-wallet
```

## 5. Security Note (Pre-Testnet)
Currently, the services run in `dev` mode. For a public testnet, ensure you update `ecosystem.config.js` to use `npm run build && npm run start` for the frontends to improve performance.
