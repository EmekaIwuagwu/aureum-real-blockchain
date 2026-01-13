/**
 * Aureum Blockchain RPC Client
 * 
 * Provides type-safe methods to interact with the Aureum Layer 1 blockchain node
 */

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "http://localhost:8545";

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

import nacl from "tweetnacl";

/**
 * Make a JSON-RPC call to the Aureum node
 */
async function rpcCall(method: string, params: any[] = []): Promise<any> {
    const request: RPCRequest = {
        jsonrpc: "2.0",
        method,
        params,
        id: Date.now(),
    };

    try {
        const response = await fetch(RPC_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(request),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data: RPCResponse = await response.json();

        if (data.error) {
            throw new Error(`RPC Error: ${data.error.message}`);
        }

        return data.result;
    } catch (error) {
        console.error(`RPC call failed for ${method}:`, error);
        throw error;
    }
}

/**
 * Helper to convert number to 8-byte BigEndian array
 */
function u64toBeBytes(n: number): Uint8Array {
    const buf = new ArrayBuffer(8);
    const view = new DataView(buf);
    view.setBigUint64(0, BigInt(n), false); // false = BigEndian
    return new Uint8Array(buf);
}

/**
 * Sign and send a transaction
 */
export async function signAndSendTransaction(
    sender: string,
    receiver: string,
    amount: number,
    nonce: number,
    fee: number,
    privateKeyHex: string
): Promise<string> {
    const encoder = new TextEncoder();

    // Parse private key from hex string
    const pkBytes = new Uint8Array(privateKeyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    const keyPair = nacl.sign.keyPair.fromSeed(pkBytes);
    const pubKey = keyPair.publicKey;

    // Construct message to sign (must match core.rs)
    const senderBytes = encoder.encode(sender);
    const receiverBytes = encoder.encode(receiver);
    const amountBytes = u64toBeBytes(amount);
    const nonceBytes = u64toBeBytes(nonce);
    const feeBytes = u64toBeBytes(fee);
    const typeBytes = new Uint8Array([0]); // Transfer

    const totalLen = senderBytes.length + receiverBytes.length + amountBytes.length + nonceBytes.length + feeBytes.length + pubKey.length + typeBytes.length;
    const message = new Uint8Array(totalLen);

    let offset = 0;
    message.set(senderBytes, offset); offset += senderBytes.length;
    message.set(receiverBytes, offset); offset += receiverBytes.length;
    message.set(amountBytes, offset); offset += amountBytes.length;
    message.set(nonceBytes, offset); offset += nonceBytes.length;
    message.set(feeBytes, offset); offset += feeBytes.length;
    message.set(pubKey, offset); offset += pubKey.length;
    message.set(typeBytes, offset);

    const signature = nacl.sign.detached(message, keyPair.secretKey);

    const tx = {
        sender,
        receiver,
        amount,
        nonce,
        fee,
        signature: Array.from(signature),
        pub_key: Array.from(pubKey),
        tx_type: "Transfer"
    };

    return await rpcCall("aureum_submitTransaction", [tx]);
}

/**
 * Get account balance in AUR
 */
export async function getBalance(address: string): Promise<number> {
    const balance = await rpcCall("eth_getBalance", [address]);
    return typeof balance === "number" ? balance : parseInt(balance || "0");
}

/**
 * Get current transaction nonce for an address
 */
export async function getNonce(address: string): Promise<number> {
    const nonce = await rpcCall("aureum_getNonce", [address]);
    return typeof nonce === "number" ? nonce : parseInt(nonce || "0");
}

/**
 * Get the latest block
 */
export async function getLatestBlock(): Promise<any> {
    return await rpcCall("aureum_getLatestBlock", []);
}

/**
 * Get block by number
 */
export async function getBlockByNumber(height: number): Promise<any> {
    return await rpcCall("aureum_getBlockByNumber", [height]);
}

/**
 * Get property information by ID
 */
export async function getProperty(propertyId: string): Promise<any> {
    return await rpcCall("aureum_getProperty", [propertyId]);
}

/**
 * Get visa application status
 */
export async function getVisaStatus(applicant: string): Promise<any> {
    return await rpcCall("aureum_getVisaStatus", [applicant]);
}

/**
 * Check if the node is online and responsive
 */
export async function checkNodeHealth(): Promise<boolean> {
    try {
        await getLatestBlock();
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Poll the blockchain for updates at a regular interval
 */
export function useBlockchainPoll(
    callback: (data: any) => void,
    intervalMs: number = 5000
) {
    if (typeof window === "undefined") return; // SSR safety

    const interval = setInterval(async () => {
        try {
            const latestBlock = await getLatestBlock();
            callback(latestBlock);
        } catch (error) {
            console.error("Blockchain poll failed:", error);
        }
    }, intervalMs);

    return () => clearInterval(interval);
}

// Export RPC URL for configuration display
export { RPC_URL };
