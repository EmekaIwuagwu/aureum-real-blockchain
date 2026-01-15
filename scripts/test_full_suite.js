/**
 * Aureum Full Integration Suite: Transfers + Escrow
 * Verifies the coexistence of standard transfers and escrow logic.
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
        const lenByte = len << 2;
        const res = new Uint8Array(1 + len);
        res[0] = lenByte;
        res.set(bytes, 1);
        return res;
    } else if (len < 16384) {
        const val = (len << 2) | 1;
        const res = new Uint8Array(2 + len);
        res[0] = val & 0xFF;
        res[1] = (val >>> 8) & 0xFF;
        res.set(bytes, 2);
        return res;
    } else {
        throw new Error("String too long for test");
    }
}

function generateAddress(pubKey) {
    const hash = keccak256(pubKey);
    return "A" + hash.slice(0, 40);
}

async function sendTransaction(senderAddr, receiverAddr, amount, privateKeyHex, typeObj = "Transfer") {
    const encoder = new TextEncoder();
    const nonce = parseInt(await rpcCall("aureum_getNonce", [senderAddr]));
    const fee = typeObj === "Transfer" ? 1 : 10; // Simple fee logic

    const pkBytes = new Uint8Array(privateKeyHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    const keypair = nacl.sign.keyPair.fromSeed(pkBytes);

    const senderBytes = encoder.encode(senderAddr);
    const receiverBytes = encoder.encode((typeObj === "Transfer" || typeObj.type === "EscrowCreate") ? receiverAddr : "0");
    const amountBytes = u64toBeBytes(amount);
    const nonceBytes = u64toBeBytes(nonce);
    const feeBytes = u64toBeBytes(fee);

    let typeBytes;
    let txTypeJSON;

    if (typeObj === "Transfer") {
        typeBytes = new Uint8Array([0]);
        txTypeJSON = "Transfer";
    } else if (typeObj.type === "EscrowCreate") {
        const arbiterBytes = encodeString(typeObj.arbiter);
        const condBytes = encodeString(typeObj.conditions);
        typeBytes = new Uint8Array(1 + arbiterBytes.length + condBytes.length);
        typeBytes[0] = 11;
        typeBytes.set(arbiterBytes, 1);
        typeBytes.set(condBytes, 1 + arbiterBytes.length);
        txTypeJSON = { EscrowCreate: { arbiter: typeObj.arbiter, conditions: typeObj.conditions } };
    } else if (typeObj.type === "EscrowRelease") {
        const idBytes = encodeString(typeObj.escrow_id);
        typeBytes = new Uint8Array(1 + idBytes.length);
        typeBytes[0] = 12;
        typeBytes.set(idBytes, 1);
        txTypeJSON = { EscrowRelease: { escrow_id: typeObj.escrow_id } };
    }

    const keyBytes = keypair.publicKey;
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
        receiver: (typeObj === "Transfer" || typeObj.type === "EscrowCreate") ? receiverAddr : "0",
        amount,
        nonce,
        fee,
        signature: Array.from(signature),
        pub_key: Array.from(keypair.publicKey),
        tx_type: txTypeJSON
    };

    return await rpcCall("aureum_submitTransaction", [tx]);
}

async function main() {
    console.log("🚀 STARTING FULL INTEGRATION TEST...");

    const aliceKey = nacl.sign.keyPair();
    const aliceAddr = generateAddress(aliceKey.publicKey);
    const bobKey = nacl.sign.keyPair(); // Receiver
    const bobAddr = generateAddress(bobKey.publicKey);

    console.log(`Validator: ${VALIDATOR_ADDRESS}`);
    console.log(`Alice:     ${aliceAddr}`);
    console.log(`Bob:       ${bobAddr}\n`);

    // 1. Fund Alice (Standard Transfer)
    console.log("1️⃣  Funding Alice (Standard Transfer)...");
    const fundHash = await sendTransaction(VALIDATOR_ADDRESS, aliceAddr, 100000, VALIDATOR_PRIVATE_KEY);
    console.log(`   Hash: ${fundHash}`);
    console.log("   waiting 30s...");
    await new Promise(r => setTimeout(r, 30000));

    const aliceBal = await rpcCall("eth_getBalance", [aliceAddr]);

    if (aliceBal < 100000) {
        console.error("❌ Transfer Failed. Alice balance: " + aliceBal);
        return;
    }
    console.log("✅ Alice Funded.\n");

    // 2. Alice creates Escrow for Bob
    console.log("2️⃣  Alice creates Escrow for Bob...");
    const alicePrivKey = Buffer.from(aliceKey.secretKey).slice(0, 32).toString('hex');

    const escrowHash = await sendTransaction(aliceAddr, bobAddr, 50000, alicePrivKey, {
        type: "EscrowCreate",
        arbiter: VALIDATOR_ADDRESS,
        conditions: "Test Goods"
    });
    console.log(`   Escrow ID: ${escrowHash}`);
    console.log("   waiting 30s...");
    await new Promise(r => setTimeout(r, 30000));

    const escrowState = await rpcCall("aureum_getEscrow", [escrowHash]);
    if (!escrowState || escrowState.status !== "Pending") {
        console.error("❌ Escrow Create Failed.");
        return;
    }
    console.log("✅ Escrow Created & Pending.\n");

    // 3. Validator (Arbiter) releases to Bob
    console.log("3️⃣  Arbiter releases funds to Bob...");
    const releaseHash = await sendTransaction(VALIDATOR_ADDRESS, bobAddr, 0, VALIDATOR_PRIVATE_KEY, {
        type: "EscrowRelease",
        escrow_id: escrowHash
    });
    console.log(`   Release Tx: ${releaseHash}`);
    console.log("   waiting 30s...");
    await new Promise(r => setTimeout(r, 30000));

    const finalEscrow = await rpcCall("aureum_getEscrow", [escrowHash]);
    const bobBal = await rpcCall("eth_getBalance", [bobAddr]);

    if (finalEscrow.status === "Released" && bobBal >= 50000) {
        console.log("✅ Escrow Released. Bob Balance: " + bobBal);
        console.log("🎉 FULL SUITE PASSED.");
    } else {
        console.error(`❌ Release Failed. Status: ${finalEscrow.status}, Bob Bal: ${bobBal}`);
    }
}

main().catch(console.error);
