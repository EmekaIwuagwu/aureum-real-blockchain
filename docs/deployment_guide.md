# Aureum Blockchain 1.0 - Deployment & Testing Guide

## 1. System Requirements
- **Rust**: v1.70+
- **Node.js**: v18+
- **Memory**: 8GB+ RAM
- **Storage**: 50GB+ SSD (for Sled DB)

## 2. Local Cluster Setup (4 Nodes)

To spin up a local BFT consensus cluster for testing:

### Step 1: Clone & Build
```bash
git clone https://github.com/EmekaIwuagwu/aureum-real-blockchain.git
cd aureum-real-blockchain/aureum-node
cargo build --release
```

### Step 2: Initialize Genesis
Generate the genesis.json with 4 validator keys.
```bash
./target/release/aureum_node init --chain-id aureum-local-1 --validators 4
```

### Step 3: Run Validators
Open 4 terminal tabs:

**Node 1 (Leader)**
```bash
./target/release/aureum_node --id 1 --port 30301 --rpc 8545 --db ./data/node1
```

**Node 2**
```bash
./target/release/aureum_node --id 2 --port 30302 --rpc 8546 --peer /ip4/127.0.0.1/tcp/30301 --db ./data/node2
```

**Node 3**
```bash
./target/release/aureum_node --id 3 --port 30303 --rpc 8547 --peer /ip4/127.0.0.1/tcp/30301 --db ./data/node3
```

**Node 4**
```bash
./target/release/aureum_node --id 4 --port 30304 --rpc 8548 --peer /ip4/127.0.0.1/tcp/30301 --db ./data/node4
```

---

## 3. System-Wide Testing

We have included a comprehensive system test suite to validate the Layer 1 primitives.

### Running the Test Suite
```bash
cargo test --package aureum-node --test system_test
```

This test performs the following lifecycle:
1.  **Genesis**: Initializes `total_supply` and `validator_set`.
2.  **Transfer**: Testing basic AUR transfers between wallets.
3.  **Property Registration**: Tokenizes a real asset (e.g., "Villa in Lisbon").
4.  **Visa Application**: Links the property to a Golden Visa request.
5.  **Smart Contract**: Deploys the `RealEstateToken.sol` bytecode and executes a state change.
6.  **Finality**: Verifies that the State Root hash is consistent.

## 4. Wallet & Interaction

### Standard Wallets (Testnet)
Use these keys for testing. **DO NOT USE ON MAINNET.**

| Role | Address (Bech32) | Private Key (Hex) |
|---|---|---|
| **Genesis Treasury** | `aur1genesis...` | `0x1111...` (See genesis.json) |
| **Alice (Investor)** | `aur1alice...` | `0xaaaa...` |
| **Bob (Seller)** | `aur1bob...` | `0xbbbb...` |

### Deploying Smart Contracts
To deploy `contracts/RealEstateToken.sol`:
1.  Compile: `solc --bin --abi contracts/RealEstateToken.sol -o build`
2.  Run Script: `node scripts/deploy_contract.js`

---

## 5. Troubleshooting
- **Peers not connecting**: Ensure ports 30301-30304 are open.
- **Bad Genesis**: Delete `./data` folders and re-run `init`.
