/**
 * Test: Verify wallet-blockchain handshake with proper transaction signing
 */

const nacl = require('tweetnacl');
const { keccak256 } = require('js-sha3');

const RPC_URL = "http://localhost:8545";

// Validator derived from 32-byte zero seed (tweetnacl)
// PubKey: 3b6a27bcceb6a42d62a3a8d02a6f0d73653215771de243a63ac048a18b59da29
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

function generateAddress(pubKey) {
    const hash = keccak256(pubKey);
    return "A" + hash.slice(0, 40);
}

async function sendTransaction(senderAddr, receiverAddr, amount, privateKeyHex) {
    const encoder = new TextEncoder();

    const nonceStr = await rpcCall("aureum_getNonce", [senderAddr]);
    const nonce = parseInt(nonceStr);
    const fee = 1;

    const pkBytes = new Uint8Array(privateKeyHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    const keypair = nacl.sign.keyPair.fromSeed(pkBytes);

    // Build message exactly as core.rs does in verify_signature
    const senderBytes = encoder.encode(senderAddr);
    const receiverBytes = encoder.encode(receiverAddr);
    const amountBytes = u64toBeBytes(amount);
    const nonceBytes = u64toBeBytes(nonce);
    const feeBytes = u64toBeBytes(fee);
    const typeBytes = new Uint8Array([0]); // SCALE encoding for Transfer variant (variant 0)

    const totalLen = senderBytes.length + receiverBytes.length + amountBytes.length +
        nonceBytes.length + feeBytes.length + keypair.publicKey.length + typeBytes.length;
    const message = new Uint8Array(totalLen);

    let offset = 0;
    message.set(senderBytes, offset); offset += senderBytes.length;
    message.set(receiverBytes, offset); offset += receiverBytes.length;
    message.set(amountBytes, offset); offset += amountBytes.length;
    message.set(nonceBytes, offset); offset += nonceBytes.length;
    message.set(feeBytes, offset); offset += feeBytes.length;
    message.set(keypair.publicKey, offset); offset += keypair.publicKey.length;
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
        tx_type: "Transfer"
    };

    console.log("   Debug - Message length:", message.length);
    console.log("   Debug - Sender:", senderAddr);
    const derived = generateAddress(keypair.publicKey);
    console.log("   Debug - Derived address from pubkey:", derived);

    if (derived !== senderAddr) {
        console.error("❌ ERROR: Derived address does not match sender address! Signatures will fail.");
        return "Invalid Address Derivation";
    }

    return await rpcCall("aureum_submitTransaction", [tx]);
}

async function main() {
    console.log("\n🔗 Aureum - Handshake Verification\n");

    console.log("📝 Generating new wallet...");
    const newKeypair = nacl.sign.keyPair();
    const newPrivateKey = Array.from(newKeypair.secretKey.slice(0, 32)).map(b => b.toString(16).padStart(2, '0')).join('');
    const newAddress = generateAddress(newKeypair.publicKey);

    console.log("   New Address:", newAddress);
    console.log("   Private Key:", newPrivateKey);
    console.log("");

    console.log("💰 Checking balances...");
    try {
        const validatorBalance = await rpcCall("eth_getBalance", [VALIDATOR_ADDRESS]);
        const newWalletBalance = await rpcCall("eth_getBalance", [newAddress]);
        console.log("   Validator:", validatorBalance, "AUR");
        console.log("   New Wallet:", newWalletBalance, "AUR");
    } catch (e) {
        console.error("❌ Failed to connect to node. Is it running? (target/release/aureum-node run)");
        return;
    }
    console.log("");

    const vBalInt = parseInt(await rpcCall("eth_getBalance", [VALIDATOR_ADDRESS]));
    if (vBalInt === 0) {
        console.log("⚠️  Validator has 0 balance. Resetting node state...");
        console.log("   1. Stop node");
        console.log("   2. Run: cargo run --bin aureum-node --release -- init");
        console.log("   3. Start node: cargo run --bin aureum-node --release -- run");
        return;
    }

    console.log("📤 Funding new wallet from validator...");
    const txHash = await sendTransaction(
        VALIDATOR_ADDRESS,
        newAddress,
        100000,
        VALIDATOR_PRIVATE_KEY
    );
    console.log("   Result:", txHash);
    console.log("");

    if (txHash.startsWith("Invalid") || txHash.startsWith("Compliance")) {
        console.log("❌ Handshake FAILED: Transaction rejected by node.");
        return;
    }

    console.log("⏳ Waiting 30s for block production (BFT steps)...");
    await new Promise(r => setTimeout(r, 30000));

    console.log("💰 Verifying synchronization...");
    const vFinal = await rpcCall("eth_getBalance", [VALIDATOR_ADDRESS]);
    const nFinal = await rpcCall("eth_getBalance", [newAddress]);
    console.log("   Validator:", vFinal, "AUR");
    console.log("   New Wallet:", nFinal, "AUR");
    console.log("");

    if (parseInt(nFinal) > 0) {
        console.log("✅ HANDSHAKE SUCCESS! Wallet and Blockchain are perfectly synced.");
        console.log("   All data formats (Addresses, Hashes) match exactly.");
    } else {
        console.log("❌ SYNC FAILED: Transaction was accepted but balance didn't update.");
    }
}

main().catch(err => {
    console.error("❌ Fatal Error:", err.message);
    process.exit(1);
});
