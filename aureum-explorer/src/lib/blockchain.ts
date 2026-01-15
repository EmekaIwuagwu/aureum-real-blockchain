/**
 * Aureum Blockchain RPC Client for Explorer
 * 
 * Provides methods to fetch and display live blockchain data
 */

const DEFAULT_RPC = "http://localhost:8545";

const detectRpcUrl = () => {
    if (typeof window !== "undefined") {
        const saved = localStorage.getItem("AUREUM_RPC_URL");
        if (saved) return saved;

        const host = window.location.hostname;
        if (host !== "localhost" && host !== "127.0.0.1") {
            return `http://${host}:8545`;
        }
    }
    return process.env.NEXT_PUBLIC_RPC_URL || DEFAULT_RPC;
};

let currentRpcUrl = detectRpcUrl();

export const getRpcUrl = () => currentRpcUrl;
export const setSharedRpcUrl = (url: string) => {
    currentRpcUrl = url;
    if (typeof window !== "undefined") {
        localStorage.setItem("AUREUM_RPC_URL", url);
    }
};

interface RPCRequest {
    jsonrpc: "2.0";
    method: string;
    params: any[];
    id: number;
}

interface RPCResponse {
    jsonrpc: "2.0";
    result?: any;
    error?: {
        code: number;
        message: string;
    };
    id: number;
}

async function rpcCall(method: string, params: any[] = []): Promise<any> {
    const request: RPCRequest = {
        jsonrpc: "2.0",
        method,
        params,
        id: Date.now(),
    };

    try {
        const response = await fetch(currentRpcUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(request),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status ${response.status}`);
        }

        const data: RPCResponse = await response.json();

        if (data.error) {
            throw new Error(`RPC Error: ${data.error.message}`);
        }

        return data.result;
    } catch (error) {
        console.error(`RPC call failed for ${method}:`, error);
        return null; // Return null for explorer to use mock data
    }
}

/**
 * Get the latest block from the blockchain
 */
export async function getLatestBlock(): Promise<any> {
    return await rpcCall("aureum_getLatestBlock", []);
}

/**
 * Get block by number/height
 */
export async function getBlockByNumber(height: number): Promise<any> {
    return await rpcCall("aureum_getBlockByNumber", [height]);
}

/**
 * Get multiple recent blocks
 */
export async function getRecentBlocks(count: number = 10): Promise<any[]> {
    try {
        const latest = await getLatestBlock();
        if (!latest) return [];

        const blocks = [];
        const startHeight = Math.max(0, latest.header.height - count + 1);

        for (let i = latest.header.height; i >= startHeight; i--) {
            const block = await getBlockByNumber(i);
            if (block) blocks.push(block);
        }

        return blocks;
    } catch (error) {
        console.error("Failed to fetch recent blocks:", error);
        return [];
    }
}

/**
 * Get property information
 */
export async function getProperty(propertyId: string): Promise<any> {
    return await rpcCall("aureum_getProperty", [propertyId]);
}

/**
 * Get the chain state (total supply, burned fees)
 */
export async function getChainState(): Promise<any> {
    return await rpcCall("aureum_getChainState", []);
}

/**
 * Get active validator set
 */
export async function getValidators(): Promise<any> {
    return await rpcCall("aureum_getValidators", []);
}

/**
 * Check node health
 */
export async function isNodeOnline(): Promise<boolean> {
    const result = await getLatestBlock();
    return result !== null;
}

export const RPC_URL = currentRpcUrl;
