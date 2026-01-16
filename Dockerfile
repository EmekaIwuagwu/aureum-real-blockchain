# --- Build Stage: Node (Rust) ---
FROM rust:1.80-slim-bookworm AS node-builder
WORKDIR /app
RUN apt-get update && apt-get install -y pkg-config libssl-dev build-essential
COPY ./aureum-node .
RUN cargo build --release

# --- Build Stage: Wallet (Next.js) ---
FROM node:20-slim AS wallet-builder
WORKDIR /app
COPY ./aureum-wallet/package*.json ./
RUN npm install
COPY ./aureum-wallet .
# Set build-time env for RPC
ARG NEXT_PUBLIC_RPC_URL=http://localhost:8545
ENV NEXT_PUBLIC_RPC_URL=$NEXT_PUBLIC_RPC_URL
RUN npm run build

# --- Build Stage: Explorer (Next.js) ---
FROM node:20-slim AS explorer-builder
WORKDIR /app
COPY ./aureum-explorer/package*.json ./
RUN npm install
COPY ./aureum-explorer .
ARG NEXT_PUBLIC_RPC_URL=http://localhost:8545
ENV NEXT_PUBLIC_RPC_URL=$NEXT_PUBLIC_RPC_URL
RUN npm run build

# --- Runtime Stage ---
FROM node:20-slim
WORKDIR /app

# Install system dependencies and PM2
RUN apt-get update && apt-get install -y openssl ca-certificates && \
    npm install -g pm2 && \
    rm -rf /var/lib/apt/lists/*

# Copy binaries and build outputs
COPY --from=node-builder /app/target/release/aureum-node ./aureum-node-bin
COPY --from=wallet-builder /app/.next ./aureum-wallet/.next
COPY --from=wallet-builder /app/public ./aureum-wallet/public
COPY --from=wallet-builder /app/package.json ./aureum-wallet/package.json
COPY --from=wallet-builder /app/node_modules ./aureum-wallet/node_modules

COPY --from=explorer-builder /app/.next ./aureum-explorer/.next
COPY --from=explorer-builder /app/public ./aureum-explorer/public
COPY --from=explorer-builder /app/package.json ./aureum-explorer/package.json
COPY --from=explorer-builder /app/node_modules ./aureum-explorer/node_modules

# Add entrypoint and process manager config
COPY ecosystem.config.js .

# Create data directory for persistent blockchain state
RUN mkdir -p /app/data/blockchain

# Ports:
# 8545: Node RPC
# 3000: Wallet
# 3001: Explorer
EXPOSE 8545 3000 3001

# Command to run everything via PM2
CMD ["pm2-runtime", "ecosystem.config.js"]
