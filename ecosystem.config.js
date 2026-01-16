module.exports = {
    apps: [
        {
            name: "aureum-node",
            script: "./aureum-node-bin",
            args: "run --rpc-port 8545 --data-dir /app/data",
            cwd: "/app",
            restart_delay: 3000
        },
        {
            name: "aureum-wallet",
            script: "npm",
            args: "start",
            cwd: "/app/aureum-wallet",
            env: {
                PORT: 3000,
                NEXT_PUBLIC_RPC_URL: "http://localhost:8545"
            }
        },
        {
            name: "aureum-explorer",
            script: "npm",
            args: "start",
            cwd: "/app/aureum-explorer",
            env: {
                PORT: 3001,
                NEXT_PUBLIC_RPC_URL: "http://localhost:8545"
            }
        }
    ]
};
