module.exports = {
    apps: [
        {
            name: "aureum-node-init",
            script: "./aureum-node/target/release/aureum-node",
            args: "init --data-dir ./data",
            autorestart: false,
            watch: false
        },
        {
            name: "aureum-node",
            script: "./aureum-node/target/release/aureum-node",
            args: "run --rpc-port 8545 --data-dir ./data",
            env: {
                RUST_LOG: "info"
            }
        },
        {
            name: "aureum-wallet",
            script: "npm",
            args: "run start -- --port 3000",
            cwd: "./aureum-wallet"
        },
        {
            name: "aureum-explorer",
            script: "npm",
            args: "run start -- --port 3001",
            cwd: "./aureum-explorer"
        }
    ]
};
