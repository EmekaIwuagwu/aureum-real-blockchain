/**
 * Test: Verify Escrow Flow (Create -> Verify -> Release)
 */

const nacl = require('tweetnacl');
const { keccak256 } = require('js-sha3');

const RPC_URL = "http://localhost:8545";
const VALIDATOR_ADDRESS = "A1109cd8305ff4145b0b89495431540d1f4faecdc";
const VALIDATOR_PRIVATE_KEY = "0000000000000000000000000000000000000000000000000000000000000000";

async function rpcCall(method, params = []) {
    const response = await fetch(RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            jsonrpc: "2.0",
            method,
            params,
            id: Date.now()
        })
    });

    const data = await response.json();
    if (data.error) throw new Error(`RPC Error: ${data.error.message}`);
    return data.result;
}

function u64toBeBytes(n) {
    const buf = new ArrayBuffer(8);
    const view = new DataView(buf);
    view.setBigUint64(0, BigInt(n), false);
    return new Uint8Array(buf);
}

function encodeString(str) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    const len = bytes.length;

    if (len < 64) {
        // Simple Compact encoding for length < 64 (Mode 0)
        // SCALE: length << 2
        const lenByte = len << 2;
        const res = new Uint8Array(1 + len);
        res[0] = lenByte;
        res.set(bytes, 1);
        return res;
    } else if (len < 16384) {
        // Mode 1: 2 bytes
        // (len << 2) | 1
        const val = (len << 2) | 1;
        const res = new Uint8Array(2 + len);
        res[0] = val & 0xFF;
        res[1] = (val >>> 8) & 0xFF;
        res.set(bytes, 2);
        return res;
    } else {
        throw new Error("String too long for test script simple encoder");
    }
}

function generateAddress(pubKey) {
    const hash = keccak256(pubKey);
    return "A" + hash.slice(0, 40);
}

async function sendTransaction(senderAddr, receiverAddr, amount, privateKeyHex, typeObj) {
    const encoder = new TextEncoder();
    const nonceStr = await rpcCall("aureum_getNonce", [senderAddr]);
    const nonce = parseInt(nonceStr);
    const fee = 1;

    const pkBytes = new Uint8Array(privateKeyHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    const keypair = nacl.sign.keyPair.fromSeed(pkBytes);

    // Build message
    const senderBytes = encoder.encode(senderAddr);
    const receiverBytes = encoder.encode(receiverAddr); // Even for Release/Refund, receiver field exists in Tx struct
    const amountBytes = u64toBeBytes(amount);
    const nonceBytes = u64toBeBytes(nonce);
    const feeBytes = u64toBeBytes(fee);

    // Construct Type Bytes (SCALE Encoded)
    let typeBytes;
    let txTypeJSON;

    if (typeObj.type === "EscrowCreate") {
        // Variant 11
        const arbiterBytes = encodeString(typeObj.arbiter);
        const condBytes = encodeString(typeObj.conditions);
        typeBytes = new Uint8Array(1 + arbiterBytes.length + condBytes.length);
        typeBytes[0] = 11;
        typeBytes.set(arbiterBytes, 1);
        typeBytes.set(condBytes, 1 + arbiterBytes.length);

        txTypeJSON = {
            EscrowCreate: {
                arbiter: typeObj.arbiter,
                conditions: typeObj.conditions
            }
        };

    } else if (typeObj.type === "EscrowRelease") {
        // Variant 12
        const idBytes = encodeString(typeObj.escrow_id);
        typeBytes = new Uint8Array(1 + idBytes.length);
        typeBytes[0] = 12;
        typeBytes.set(idBytes, 1);

        txTypeJSON = {
            EscrowRelease: {
                escrow_id: typeObj.escrow_id
            }
        };

    } else {
        throw new Error("Unknown type");
    }

    const keyBytes = keypair.publicKey;

    // Concat for signing
    const totalLen = senderBytes.length + receiverBytes.length + amountBytes.length +
        nonceBytes.length + feeBytes.length + keyBytes.length + typeBytes.length;

    const message = new Uint8Array(totalLen);
    let offset = 0;
    message.set(senderBytes, offset); offset += senderBytes.length;
    message.set(receiverBytes, offset); offset += receiverBytes.length;
    message.set(amountBytes, offset); offset += amountBytes.length;
    message.set(nonceBytes, offset); offset += nonceBytes.length;
    message.set(feeBytes, offset); offset += feeBytes.length;
    message.set(keyBytes, offset); offset += keyBytes.length;
    message.set(typeBytes, offset);

    const signature = nacl.sign.detached(message, keypair.secretKey);

    const tx = {
        sender: senderAddr,
        receiver: receiverAddr,
        amount,
        nonce,
        fee,
        signature: Array.from(signature),
        pub_key: Array.from(keypair.publicKey),
        tx_type: txTypeJSON
    };

    console.log(`Sending ${typeObj.type}...`);
    return await rpcCall("aureum_submitTransaction", [tx]);
}

async function main() {
    console.log("\n🔒 Aureum - Escrow Flow Verification\n");

    const newKeypair = nacl.sign.keyPair();
    const receiverAddr = generateAddress(newKeypair.publicKey);
    console.log("Receiver:", receiverAddr);

    // 1. Create Escrow
    const amount = 5000;
    const arbiter = VALIDATOR_ADDRESS;

    console.log("1️⃣ Creating Escrow...");
    const escrowHash = await sendTransaction(
        VALIDATOR_ADDRESS,
        receiverAddr,
        amount,
        VALIDATOR_PRIVATE_KEY,
        {
            type: "EscrowCreate",
            arbiter: arbiter,
            conditions: "Delivery of Goods"
        }
    );
    console.log("   Tx Hash/Escrow ID:", escrowHash);

    console.log("⏳ Waiting 30s for confirmation...");
    await new Promise(r => setTimeout(r, 30000));

    // 2. Verify Escrow State
    console.log("2️⃣ Verifying Escrow State...");
    const escrowState = await rpcCall("aureum_getEscrow", [escrowHash]);
    console.log("   State:", escrowState);

    if (escrowState && escrowState.status === "Pending") {
        console.log("✅ Escrow Created Successfully!");
    } else {
        console.error("❌ Escrow creation failed or state mismatch.");
        return;
    }

    // 3. Release Escrow
    console.log("3️⃣ Releasing Escrow...");
    const releaseHash = await sendTransaction(
        VALIDATOR_ADDRESS, // Arbiter
        receiverAddr, // Receiver (must match original receiver? The struct stores it, but tx receiver field is mostly ignored or should match logic)
        0, // Amount 0 for state change
        VALIDATOR_PRIVATE_KEY,
        {
            type: "EscrowRelease",
            escrow_id: escrowHash
        }
    );
    console.log("   Release Tx:", releaseHash);

    console.log("⏳ Waiting 30s for processing...");
    await new Promise(r => setTimeout(r, 30000));

    // 4. Verify Final State
    const finalEscrow = await rpcCall("aureum_getEscrow", [escrowHash]);
    const receiverBalance = await rpcCall("eth_getBalance", [receiverAddr]);

    console.log("   Final Escrow Status:", finalEscrow.status);
    console.log("   Receiver Balance:", receiverBalance);

    if (finalEscrow.status === "Released" && parseInt(receiverBalance) === 5000) {
        console.log("✅✅✅ FULL ESCROW FLOW SUCCESSFUL! Funds released to receiver.");
    } else {
        console.log("❌ Escrow Flow Failed.");
    }
}

main().catch(console.error);
