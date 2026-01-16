import { NextResponse } from 'next/server';

export async function GET() {
    const start = Date.now();

    try {
        // 1. Check Node (RPC)
        const nodeResponse = await fetch("http://localhost:8545", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", method: "aureum_getHealth", params: [], id: 1 }),
            next: { revalidate: 0 }
        }).catch(() => null);

        const nodeHealth = nodeResponse ? await nodeResponse.json() : null;

        // 2. Check Wallet (Internal Docker/Localhost ping)
        // In Docker, we try to see if the port is reachable
        const walletReady = await fetch("http://localhost:3000", { next: { revalidate: 0 } })
            .then(r => r.ok)
            .catch(() => false);

        const status = (nodeHealth && nodeHealth.result && nodeHealth.result.status === "UP") ? "healthy" : "degraded";

        return NextResponse.json({
            status,
            timestamp: new Date().toISOString(),
            latency_ms: Date.now() - start,
            ecosystem: {
                node: nodeHealth?.result || { status: "DOWN" },
                wallet: walletReady ? "UP" : "DOWN",
                explorer: "UP"
            }
        }, {
            status: status === "healthy" ? 200 : 503
        });
    } catch (error: any) {
        return NextResponse.json({
            status: "unhealthy",
            error: error.message
        }, { status: 500 });
    }
}
