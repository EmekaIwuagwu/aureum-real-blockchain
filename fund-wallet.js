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

async function fund(address, amount) {
    const encoder = new TextEncoder();
    const nonceStr = await rpcCall("aureum_getNonce", [VALIDATOR_ADDRESS]);
    const nonce = parseInt(nonceStr);
    const fee = 1;
    const pkBytes = new Uint8Array(VALIDATOR_PRIVATE_KEY.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    const keypair = nacl.sign.keyPair.fromSeed(pkBytes);

    const senderBytes = encoder.encode(VALIDATOR_ADDRESS);
    const receiverBytes = encoder.encode(address);
    const amountBytes = u64toBeBytes(amount);
    const nonceBytes = u64toBeBytes(nonce);
    const feeBytes = u64toBeBytes(fee);
    const typeBytes = new Uint8Array([0]);

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
        sender: VALIDATOR_ADDRESS,
        receiver: address,
        amount,
        nonce,
        fee,
        signature: Array.from(signature),
        pub_key: Array.from(keypair.publicKey),
        tx_type: "Transfer"
    };

    return await rpcCall("aureum_submitTransaction", [tx]);
}

const target = process.argv[2] || "Ab019b41ff4f3a95a9f7aa503e3cb2e3e3aa56569";
fund(target, 500000).then(res => console.log("Funded address", target, "Hash:", res)).catch(console.error);
