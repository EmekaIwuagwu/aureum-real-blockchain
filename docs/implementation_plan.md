# Aureum Chain Implementation Plan

A regulatory-compliant L1 blockchain for cross-border golden visa real estate investments.

## Project Structure
- `/aureum-node`: Core blockchain node (Rust)
- `/aureum-wallet`: Luxury investor wallet (NextJS + Wasm)
- `/aureum-explorer`: High-fidelity blockchain explorer (NextJS)
- `/docs`: Technical specifications and API documentation

## Phase 1: Planning and Setup (Current)
- [x] Initialize repository structure
- [ ] Generate brand identity and logo
- [ ] Define JSON-RPC API specifications
- [ ] Set up Rust workspace for `aureum-node`
- [ ] Initialize NextJS projects for wallet and explorer

## Phase 2: Core Node Development (Rust)
- [ ] Implement Tendermint-based PoS consensus
- [ ] Develop Compliance VM (EVM compatible + ZKP hooks)
- [ ] Build JSON-RPC server
- [ ] Implement AUR token logic (Burn/Reward)

## Phase 3: UI/UX Development (NextJS)
- [ ] Create `index.css` design system (Black/Red/Gold)
- [ ] Build `aureum-wallet` dashboard
- [ ] Build `aureum-explorer` visualizations

## Phase 4: Integration
- [ ] Connect Wallet/Explorer to Node via JSON-RPC
- [ ] Implement ZKP-based KYC flow
- [ ] Property tokenization (Hybrid ERC-1155)

## Phase 5: Testing & Audit
- [ ] Load testing (Target: 10k TPS)
- [ ] Security auditing (Formal verification)
- [ ] Testnet launch
