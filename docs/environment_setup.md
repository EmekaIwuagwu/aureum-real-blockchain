# Aureum Wallet & Explorer - Environment Setup

## Wallet Configuration

Create `aureum-wallet/.env.local` with:
```bash
NEXT_PUBLIC_RPC_URL=http://localhost:8545
NEXT_PUBLIC_CHAIN_ID=aureum-1
NEXT_PUBLIC_NETWORK_NAME=Aureum Mainnet
```

## Explorer Configuration

Create `aureum-explorer/.env.local` with:
```bash
NEXT_PUBLIC_RPC_URL=http://localhost:8545
NEXT_PUBLIC_CHAIN_ID=aureum-1
```

## Testing Configuration (Local Development)

When running all three services locally:
- **Blockchain Node**: http://localhost:8545
- **Wallet**: http://localhost:3000
- **Explorer**: http://localhost:3001

Start commands:
```bash
# Terminal 1: Blockchain Node
cd aureum-node && cargo run --release

# Terminal 2: Wallet
cd aureum-wallet && npm run dev

# Terminal 3: Explorer  
cd aureum-explorer && npm run dev -- -p 3001
```

## Production Configuration

For deployed networks, update the RPC_URL to your live node:
```bash
NEXT_PUBLIC_RPC_URL=https://rpc.aureum.network
```
