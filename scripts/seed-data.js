const { rpcCall, tokenizeProperty } = require('./blockchain_node');

const VALIDATOR_ADDR = "A1109cd8305ff4145b0b89495431540d1f4faecdc";
const VALIDATOR_PK = "3b6a27bcceb6a42d62a3a8d02a6f0d73653215771de243a63ac048a18b59da29";

const SEED_PROPERTIES = [
    {
        address: "Avenida da Liberdade, Lisbon",
        price: 500000,
        metadata: "Golden Palace Lisbon, premium penthouse with river view."
    },
    {
        address: "Ribeira District, Porto",
        price: 350000,
        metadata: "Azure Porto Heights, modern architectural marvel."
    },
    {
        address: "Vilamoura, Algarve",
        price: 1200000,
        metadata: "Algarve Beachfront Villa, exclusive sustainable asset."
    }
];

async function seed() {
    console.log("🌱 Starting blockchain data seeding...");

    try {
        let nonce = parseInt(await rpcCall("aureum_getNonce", [VALIDATOR_ADDR]));
        console.log(`Current Nonce: ${nonce}`);

        for (const prop of SEED_PROPERTIES) {
            console.log(`Tokenizing: ${prop.address}...`);
            const txHash = await tokenizeProperty(
                VALIDATOR_ADDR,
                prop.address,
                prop.price,
                prop.metadata,
                nonce,
                VALIDATOR_PK
            );
            console.log(`✅ Success! Tx Hash: ${txHash}`);
            nonce++;
            // Wait for block finalization (5s) before next tx if node is serial
            await new Promise(r => setTimeout(r, 6000));
        }

        console.log("✨ Seeding complete!");
    } catch (error) {
        console.error("❌ Seeding failed:", error);
    }
}

seed();
