use serde::{Serialize, Deserialize};
use sha3::{Digest, Keccak256};
use parity_scale_codec::{Encode, Decode};

#[derive(Debug, Serialize, Deserialize, Clone, Encode, Decode)]
pub struct Transaction {
    pub sender: String,   // Format: aur1...
    pub receiver: String, // Format: aur1...
    pub amount: u64,
    pub nonce: u64,
    pub fee: u64,         // Institutional network fee
    pub signature: Vec<u8>,
    pub tx_type: TransactionType,
}

#[derive(Debug, Serialize, Deserialize, Clone, Encode, Decode)]
pub enum TransactionType {
    Transfer,
    Stake { amount: u64 },
    Unstake { amount: u64 },
    Delegate { validator: String, amount: u64 },
    Mint { amount: u64 }, // Institutional minting
    Burn { amount: u64 }, // Intentional burning
    TokenizeProperty { address: String, metadata: String },
    IdentityUpdate { did: String },
}

#[derive(Debug, Serialize, Deserialize, Clone, Encode, Decode)]
pub struct ChainState {
    pub total_supply: u64,
    pub burned_fees: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone, Encode, Decode, PartialEq)]
pub enum ValidatorRole {
    Standard,
    Authority, // Special subset with veto rights
}

#[derive(Debug, Serialize, Deserialize, Clone, Encode, Decode)]
pub struct Validator {
    pub address: String,
    pub public_key: Vec<u8>,
    pub stake: u64,
    pub role: ValidatorRole,
    pub last_active: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone, Encode, Decode)]
pub struct ValidatorSet {
    pub validators: Vec<Validator>,
    pub total_stake: u64,
}

impl ValidatorSet {
    pub fn get_authority_nodes(&self) -> Vec<Validator> {
        self.validators.iter()
            .filter(|v| v.role == ValidatorRole::Authority)
            .cloned()
            .collect()
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, Encode, Decode)]
pub struct Block {
    pub header: BlockHeader,
    pub transactions: Vec<Transaction>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Encode, Decode)]
pub struct BlockHeader {
    pub parent_hash: String,
    pub timestamp: u64,
    pub height: u64,
    pub state_root: String,
    pub tx_merkle_root: String,
}

impl Block {
    pub fn new_genesis() -> Self {
        Block {
            header: BlockHeader {
                parent_hash: "0000000000000000000000000000000000000000000000000000000000000000".to_string(),
                timestamp: 1768234250, // Launch epoch
                height: 0,
                state_root: "genesis_state".to_string(),
                tx_merkle_root: "0".to_string(),
            },
            transactions: vec![],
        }
    }

    pub fn hash(&self) -> String {
        let mut hasher = Keccak256::new();
        hasher.update(self.header.parent_hash.as_bytes());
        hasher.update(self.header.height.to_be_bytes());
        hasher.update(self.header.timestamp.to_be_bytes());
        let hash_bytes = hasher.finalize();
        hex::encode(hash_bytes)
    }
}

pub fn generate_address(public_key: &[u8]) -> String {
    let mut hasher = Keccak256::new();
    hasher.update(public_key);
    let result = hasher.finalize();
    format!("aur1{}", hex::encode(&result[..20]))
}
