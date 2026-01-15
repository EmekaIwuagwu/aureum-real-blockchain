
const RPC_URL = "http://localhost:8545";

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
    return await response.json();
}

async function main() {
    const id = "1abde50143f88f4945bee7737680c2fb76b6fa866e8bdf8c7d9d8b767813a304";
    console.log(`Checking Escrow: ${id}`);
    const res = await rpcCall("aureum_getEscrow", [id]);
    console.log("Full Response:", JSON.stringify(res, null, 2));
}

main().catch(console.error);
