# Aureum Integration Guide - Wallet & Explorer

## Backend (Blockchain Node)

### Starting the Node

```bash
cd aureum-node
cargo build --release
./target/release/aureum-node
```

The node will start on:
- **RPC Server**: `http://localhost:8545`
- **P2P Network**: `0.0.0.0:30301`

### Available RPC Endpoints

#### Block & Transaction Queries
- `aureum_getBlockByNumber` - Get block by height
- `aureum_getLatestBlock` - Get the most recent block
- `aureum_sendTransaction` - Submit a signed transaction

#### Account & Balance
- `eth_getBalance` - Get account balance (args: `[address]`)
- `aureum_getNonce` - Get transaction nonce for address

#### Property & Visa (Institutional Features)
- `aureum_getProperty` - Query property by ID (args: `["prop_0"]`)
- `aureum_getVisaStatus` - Query visa application (args: `["aur1alice..."]`)

---

## Frontend Integration

### Wallet Connection

Create `aureum-wallet/src/lib/blockchain.ts`:
```typescript
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "http://localhost:8545";

export async function rpcCall(method: string, params: any[] = []) {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method,
      params,
      id: 1,
    }),
  });
  const data = await response.json();
  return data.result;
}

export async function getBalance(address: string) {
  return await rpcCall("eth_getBalance", [address]);
}

export async function sendTransaction(tx: any) {
  return await rpcCall("aureum_sendTransaction", [tx]);
}
```

### Explorer Connection

Update `aureum-explorer/src/app/page.tsx` to fetch live data:
```typescript
// Add at the top of the component
useEffect(() => {
  const fetchBlocks = async () => {
    try {
      const response = await fetch("http://localhost:8545", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "aureum_getLatestBlock",
          params: [],
          id: 1,
        }),
      });
      const data = await response.json();
      console.log("Latest block:", data.result);
    } catch (error) {
      console.error("Failed to fetch blocks:", error);
    }
  };
  
  fetchBlocks();
  const interval = setInterval(fetchBlocks, 5000); // Poll every 5s
  return () => clearInterval(interval);
}, []);
```

---

## Testing the Integration

### Step 1: Start the Node
```bash
cd aureum-node
cargo run --release
```

### Step 2: Test RPC with curl
```bash
# Get balance
curl -X POST http://localhost:8545 -H "Content-Type: application/json" --data '{
  "jsonrpc": "2.0",
  "method": "eth_getBalance",
  "params": ["genesis"],
  "id": 1
}'

# Get latest block
curl -X POST http://localhost:8545 -H "Content-Type: application/json" --data '{
  "jsonrpc": "2.0",
  "method": "aureum_getLatestBlock",
  "params": [],
  "id": 1
}'
```

### Step 3: Start the Wallet & Explorer
```bash
# Terminal 1: Wallet
cd aureum-wallet
npm run dev  # Runs on http://localhost:3000

# Terminal 2: Explorer
cd aureum-explorer
npm run dev  # Runs on http://localhost:3001
```

---

## Environment Variables

### Wallet (`.env.local`)
```
NEXT_PUBLIC_RPC_URL=http://localhost:8545
NEXT_PUBLIC_CHAIN_ID=aureum-1
```

### Explorer (`.env.local`)
```
NEXT_PUBLIC_RPC_URL=http://localhost:8545
```

---

## Production Deployment

For production, update the RPC_URL to your live node:
```
NEXT_PUBLIC_RPC_URL=https://rpc.aureum.network
```
