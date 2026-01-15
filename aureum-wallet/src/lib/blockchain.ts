/**
 * Aureum Blockchain RPC Client
 * 
 * Provides type-safe methods to interact with the Aureum Layer 1 blockchain node
 */

const DEFAULT_RPC = "http://localhost:8545";

const detectRpcUrl = () => {
    if (typeof window !== "undefined") {
        // 1. Check localStorage first
        const saved = localStorage.getItem("AUREUM_RPC_URL");
        if (saved) return saved;

        // 2. Detect from hostname
        const host = window.location.hostname;
        if (host !== "localhost" && host !== "127.0.0.1") {
            return `http://${host}:8545`;
        }
    }
    return process.env.NEXT_PUBLIC_RPC_URL || DEFAULT_RPC;
};

let currentRpcUrl = detectRpcUrl();

export const getRpcUrl = () => currentRpcUrl;
export const setGlobalRpcUrl = (url: string) => {
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
        const response = await fetch(currentRpcUrl, {
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
/**
 * Helper to convert number to 8-byte BigEndian array
 */
function u64toBeBytes(n: number): Uint8Array {
    const buf = new ArrayBuffer(8);
    const view = new DataView(buf);
    view.setBigUint64(0, BigInt(n), false); // false = BigEndian
    return new Uint8Array(buf);
}

function encodeString(str: string): Uint8Array {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    const len = bytes.length;
    // Simple Compact encoding for length < 64
    const lenByte = len << 2;
    const res = new Uint8Array(1 + len);
    res[0] = lenByte;
    res.set(bytes, 1);
    return res;
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

    // Default Transfer (index 0)
    const typeBytes = new Uint8Array([0]);

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
 * Tokenize a new property on the blockchain
 */
export async function tokenizeProperty(
    owner: string,
    physicalAddress: string,
    valuationAUR: number,
    metadata: string,
    nonce: number,
    privateKeyHex: string
): Promise<string> {
    const encoder = new TextEncoder();
    const pkBytes = new Uint8Array(privateKeyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    const keyPair = nacl.sign.keyPair.fromSeed(pkBytes);
    const pubKey = keyPair.publicKey;

    // Encodings for message signing
    const senderBytes = encoder.encode(owner);
    const receiverBytes = encoder.encode("0"); // System address for tokenization
    const amountBytes = u64toBeBytes(valuationAUR);
    const nonceBytes = u64toBeBytes(nonce);
    const feeBytes = u64toBeBytes(10); // Standard fee

    // TransactionType::TokenizeProperty is variant index 3
    const typeBytes = new Uint8Array([3]);
    // String encodings for SCALE (length-prefixed)
    const addrBytes = encoder.encode(physicalAddress);
    const metaBytes = encoder.encode(metadata);

    // We append the strings to the message for signing
    const totalLen = senderBytes.length + receiverBytes.length + amountBytes.length + nonceBytes.length + feeBytes.length + pubKey.length + typeBytes.length + addrBytes.length + metaBytes.length + 2; // +2 for simple len prefix bytes
    const message = new Uint8Array(totalLen);

    let offset = 0;
    message.set(senderBytes, offset); offset += senderBytes.length;
    message.set(receiverBytes, offset); offset += receiverBytes.length;
    message.set(amountBytes, offset); offset += amountBytes.length;
    message.set(nonceBytes, offset); offset += nonceBytes.length;
    message.set(feeBytes, offset); offset += feeBytes.length;
    message.set(pubKey, offset); offset += pubKey.length;
    message.set(typeBytes, offset); offset += typeBytes.length;
    // Simple mock SCALE string encoding for the signature message
    message[offset] = addrBytes.length << 2; offset++;
    message.set(addrBytes, offset); offset += addrBytes.length;
    message[offset] = metaBytes.length << 2; offset++;
    message.set(metaBytes, offset);

    const signature = nacl.sign.detached(message, keyPair.secretKey);

    const tx = {
        sender: owner,
        receiver: "0",
        amount: valuationAUR,
        nonce,
        fee: 10,
        signature: Array.from(signature),
        pub_key: Array.from(pubKey),
        tx_type: { TokenizeProperty: { address: physicalAddress, metadata } }
    };

    return await rpcCall("aureum_submitTransaction", [tx]);
}

/**
 * Apply for a Golden Visa / Residency Program via property investment
 */
export async function applyForVisa(
    applicant: string,
    propertyId: string,
    programIndex: number, // 0=PT, 1=UAE, 2=UK, 3=Malta
    investmentAmount: number,
    nonce: number,
    privateKeyHex: string
): Promise<string> {
    const encoder = new TextEncoder();
    const pkBytes = new Uint8Array(privateKeyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    const keyPair = nacl.sign.keyPair.fromSeed(pkBytes);
    const pubKey = keyPair.publicKey;

    const senderBytes = encoder.encode(applicant);
    const receiverBytes = encoder.encode("0");
    const amountBytes = u64toBeBytes(investmentAmount);
    const nonceBytes = u64toBeBytes(nonce);
    const feeBytes = u64toBeBytes(25); // Higher fee for compliance processing

    // TransactionType::ApplyForVisa is variant index 4
    const typeBytes = new Uint8Array([4]);
    // Property ID is a string (len-prefixed)
    const propIdBytes = encoder.encode(propertyId);
    // Program is an enum (1 byte)
    const progByte = new Uint8Array([programIndex]);

    const totalLen = senderBytes.length + receiverBytes.length + amountBytes.length + nonceBytes.length + feeBytes.length + pubKey.length + typeBytes.length + propIdBytes.length + 1 + progByte.length;
    const message = new Uint8Array(totalLen);

    let offset = 0;
    message.set(senderBytes, offset); offset += senderBytes.length;
    message.set(receiverBytes, offset); offset += receiverBytes.length;
    message.set(amountBytes, offset); offset += amountBytes.length;
    message.set(nonceBytes, offset); offset += nonceBytes.length;
    message.set(feeBytes, offset); offset += feeBytes.length;
    message.set(pubKey, offset); offset += pubKey.length;
    message.set(typeBytes, offset); offset += typeBytes.length;
    // SCALE string
    message[offset] = propIdBytes.length << 2; offset++;
    message.set(propIdBytes, offset); offset += propIdBytes.length;
    // Enum
    message.set(progByte, offset);

    const signature = nacl.sign.detached(message, keyPair.secretKey);

    const programs = ["PortugalGoldenVisa", "UAEGoldenVisa", "UKHighValueResidency", "MaltaCitizenshipByInvestment"];

    const tx = {
        sender: applicant,
        receiver: "0",
        amount: investmentAmount,
        nonce,
        fee: 25,
        signature: Array.from(signature),
        pub_key: Array.from(pubKey),
        tx_type: { ApplyForVisa: { property_id: propertyId, program: programs[programIndex] } }
    };

    return await rpcCall("aureum_submitTransaction", [tx]);
}

/**
 * Create an Escrow storage for a transaction
 */
export async function createEscrow(
    sender: string,
    receiver: string,
    arbiter: string,
    amount: number,
    conditions: string,
    nonce: number,
    privateKeyHex: string
): Promise<string> {
    const encoder = new TextEncoder();
    const pkBytes = new Uint8Array(privateKeyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    const keyPair = nacl.sign.keyPair.fromSeed(pkBytes);
    const pubKey = keyPair.publicKey;

    const senderBytes = encoder.encode(sender);
    const receiverBytes = encoder.encode(receiver);
    const amountBytes = u64toBeBytes(amount);
    const nonceBytes = u64toBeBytes(nonce);
    const feeBytes = u64toBeBytes(50); // Escrow fee

    // TransactionType::EscrowCreate is variant index 11
    const typeBytes = new Uint8Array([11]);
    const arbiterBytes = encodeString(arbiter);
    const condBytes = encodeString(conditions);

    const totalLen = senderBytes.length + receiverBytes.length + amountBytes.length + nonceBytes.length + feeBytes.length + pubKey.length + typeBytes.length + arbiterBytes.length + condBytes.length;
    const message = new Uint8Array(totalLen);

    let offset = 0;
    message.set(senderBytes, offset); offset += senderBytes.length;
    message.set(receiverBytes, offset); offset += receiverBytes.length;
    message.set(amountBytes, offset); offset += amountBytes.length;
    message.set(nonceBytes, offset); offset += nonceBytes.length;
    message.set(feeBytes, offset); offset += feeBytes.length;
    message.set(pubKey, offset); offset += pubKey.length;
    message.set(typeBytes, offset); offset += typeBytes.length;
    message.set(arbiterBytes, offset); offset += arbiterBytes.length;
    message.set(condBytes, offset);

    const signature = nacl.sign.detached(message, keyPair.secretKey);

    const tx = {
        sender,
        receiver,
        amount,
        nonce,
        fee: 50,
        signature: Array.from(signature),
        pub_key: Array.from(pubKey),
        tx_type: { EscrowCreate: { arbiter, conditions } }
    };

    return await rpcCall("aureum_submitTransaction", [tx]);
}

/**
 * Release funds from an Escrow
 */
export async function releaseEscrow(
    sender: string,
    escrowId: string,
    nonce: number,
    privateKeyHex: string
): Promise<string> {
    const encoder = new TextEncoder();
    const pkBytes = new Uint8Array(privateKeyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    const keyPair = nacl.sign.keyPair.fromSeed(pkBytes);
    const pubKey = keyPair.publicKey;

    const senderBytes = encoder.encode(sender);
    const receiverBytes = encoder.encode("0"); // System receiver for command
    const amountBytes = u64toBeBytes(0);
    const nonceBytes = u64toBeBytes(nonce);
    const feeBytes = u64toBeBytes(10); // Standard fee

    // TransactionType::EscrowRelease is variant index 12
    const typeBytes = new Uint8Array([12]);
    const idBytes = encodeString(escrowId);

    const totalLen = senderBytes.length + receiverBytes.length + amountBytes.length + nonceBytes.length + feeBytes.length + pubKey.length + typeBytes.length + idBytes.length;
    const message = new Uint8Array(totalLen);

    let offset = 0;
    message.set(senderBytes, offset); offset += senderBytes.length;
    message.set(receiverBytes, offset); offset += receiverBytes.length;
    message.set(amountBytes, offset); offset += amountBytes.length;
    message.set(nonceBytes, offset); offset += nonceBytes.length;
    message.set(feeBytes, offset); offset += feeBytes.length;
    message.set(pubKey, offset); offset += pubKey.length;
    message.set(typeBytes, offset); offset += typeBytes.length;
    message.set(idBytes, offset);

    const signature = nacl.sign.detached(message, keyPair.secretKey);

    const tx = {
        sender,
        receiver: "0",
        amount: 0,
        nonce,
        fee: 10,
        signature: Array.from(signature),
        pub_key: Array.from(pubKey),
        tx_type: { EscrowRelease: { escrow_id: escrowId } }
    };

    return await rpcCall("aureum_submitTransaction", [tx]);
}

/**
 * Refund funds from an Escrow (Arbiter only)
 */
export async function refundEscrow(
    sender: string,
    escrowId: string,
    nonce: number,
    privateKeyHex: string
): Promise<string> {
    const encoder = new TextEncoder();
    const pkBytes = new Uint8Array(privateKeyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    const keyPair = nacl.sign.keyPair.fromSeed(pkBytes);
    const pubKey = keyPair.publicKey;

    const senderBytes = encoder.encode(sender);
    const receiverBytes = encoder.encode("0");
    const amountBytes = u64toBeBytes(0);
    const nonceBytes = u64toBeBytes(nonce);
    const feeBytes = u64toBeBytes(10);

    // TransactionType::EscrowRefund is variant index 13
    const typeBytes = new Uint8Array([13]);
    const idBytes = encodeString(escrowId);

    const totalLen = senderBytes.length + receiverBytes.length + amountBytes.length + nonceBytes.length + feeBytes.length + pubKey.length + typeBytes.length + idBytes.length;
    const message = new Uint8Array(totalLen);

    let offset = 0;
    message.set(senderBytes, offset); offset += senderBytes.length;
    message.set(receiverBytes, offset); offset += receiverBytes.length;
    message.set(amountBytes, offset); offset += amountBytes.length;
    message.set(nonceBytes, offset); offset += nonceBytes.length;
    message.set(feeBytes, offset); offset += feeBytes.length;
    message.set(pubKey, offset); offset += pubKey.length;
    message.set(typeBytes, offset); offset += typeBytes.length;
    message.set(idBytes, offset);

    const signature = nacl.sign.detached(message, keyPair.secretKey);

    const tx = {
        sender,
        receiver: "0",
        amount: 0,
        nonce,
        fee: 10,
        signature: Array.from(signature),
        pub_key: Array.from(pubKey),
        tx_type: { EscrowRefund: { escrow_id: escrowId } }
    };

    return await rpcCall("aureum_submitTransaction", [tx]);
}

/**
 * Get account balance in AUR
 */
export async function getBalance(address: string): Promise<number> {
    const balance = await rpcCall("aureum_getBalance", [address]);
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
 * List all tokenized properties
 */
export async function listProperties(): Promise<any[]> {
    return await rpcCall("aureum_listProperties", []);
}

/**
 * List all escrows
 */
export async function listEscrows(): Promise<any[]> {
    return await rpcCall("aureum_listEscrows", []);
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

// Export current server for initial state
export const RPC_URL = currentRpcUrl;
