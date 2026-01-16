const nacl = require('tweetnacl');

const RPC_URL = "http://localhost:8545";

async function rpcCall(method, params = []) {
    const response = await fetch(RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method, params, id: Date.now() }),
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
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
    const res = new Uint8Array(1 + len);
    res[0] = len << 2;
    res.set(bytes, 1);
    return res;
}

async function tokenizeProperty(owner, address, valuationAUR, metadata, nonce, privateKeyHex) {
    const pkBytes = Buffer.from(privateKeyHex, 'hex');
    const keyPair = nacl.sign.keyPair.fromSeed(pkBytes);
    const pubKey = keyPair.publicKey;

    const encoder = new TextEncoder();
    const senderBytes = encoder.encode(owner);
    const receiverBytes = encoder.encode("0");
    const amountBytes = u64toBeBytes(valuationAUR);
    const nonceBytes = u64toBeBytes(nonce);
    const feeBytes = u64toBeBytes(10);
    const typeBytes = new Uint8Array([3]);
    const addrBytes = encoder.encode(address);
    const metaBytes = encoder.encode(metadata);

    const totalLen = senderBytes.length + receiverBytes.length + amountBytes.length + nonceBytes.length + feeBytes.length + pubKey.length + typeBytes.length + addrBytes.length + metaBytes.length + 2;
    const message = new Uint8Array(totalLen);

    let offset = 0;
    message.set(senderBytes, offset); offset += senderBytes.length;
    message.set(receiverBytes, offset); offset += receiverBytes.length;
    message.set(amountBytes, offset); offset += amountBytes.length;
    message.set(nonceBytes, offset); offset += nonceBytes.length;
    message.set(feeBytes, offset); offset += feeBytes.length;
    message.set(pubKey, offset); offset += pubKey.length;
    message.set(typeBytes, offset); offset += typeBytes.length;
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
        tx_type: { TokenizeProperty: { address, metadata } }
    };

    return await rpcCall("aureum_submitTransaction", [tx]);
}

module.exports = { rpcCall, tokenizeProperty };
EOF
