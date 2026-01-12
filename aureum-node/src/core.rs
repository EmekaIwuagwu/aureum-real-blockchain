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

impl Transaction {
    pub fn verify_signature(&self) -> bool {
        use ed25519_dalek::{VerifyingKey, Signature, Verifier};
        
        // Remove aur1 prefix and treat as hex for public key
        let pub_key_res = hex::decode(self.sender.replace("aur1", ""));
        let Ok(public_key_bytes) = pub_key_res else { return false; };
        if public_key_bytes.len() != 32 { return false; }
        
        let Ok(public_key) = VerifyingKey::from_bytes(&public_key_bytes.try_into().unwrap_or([0u8; 32])) else {
            return false;
        };

        let mut msg = Vec::new();
        msg.extend_from_slice(self.sender.as_bytes());
        msg.extend_from_slice(self.receiver.as_bytes());
        msg.extend_from_slice(&self.amount.to_be_bytes());
        msg.extend_from_slice(&self.nonce.to_be_bytes());
        msg.extend_from_slice(&self.fee.to_be_bytes());
        msg.extend_from_slice(&self.tx_type.encode());

        let Ok(sig) = Signature::from_slice(&self.signature) else {
            return false;
        };

        public_key.verify(&msg, &sig).is_ok()
    }
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

    pub fn calculate_merkle_root(&self) -> String {
        if self.transactions.is_empty() {
            return "0".to_string();
        }
        
        let mut hashes: Vec<Vec<u8>> = self.transactions.iter().map(|tx| {
            let mut hasher = Keccak256::new();
            hasher.update(tx.encode());
            hasher.finalize().to_vec()
        }).collect();

        while hashes.len() > 1 {
            if hashes.len() % 2 != 0 {
                hashes.push(hashes.last().unwrap().clone());
            }
            let mut next_level = vec![];
            for i in (0..hashes.len()).step_by(2) {
                let mut hasher = Keccak256::new();
                hasher.update(&hashes[i]);
                hasher.update(&hashes[i+1]);
                next_level.push(hasher.finalize().to_vec());
            }
            hashes = next_level;
        }
        hex::encode(&hashes[0])
    }
}

pub fn generate_address(public_key: &[u8]) -> String {
    let mut hasher = Keccak256::new();
    hasher.update(public_key);
    let result = hasher.finalize();
    format!("aur1{}", hex::encode(&result[..20]))
}

// --- Institutional Property Asset Model (Part 1.3) ---

#[derive(Debug, Serialize, Deserialize, Clone, Encode, Decode)]
pub struct Property {
    pub id: String,                 // PropertyId (UUID or sequential)
    pub owner: String,              // Primary Owner Address
    pub co_owners: Vec<(String, u64)>, // Fractional ownership (Address, StakeBasisPoints)
    
    // Legal & location
    pub jurisdiction: String,       // e.g., "Portugal", "UAE"
    pub legal_description: String,
    pub coordinates: (f64, f64),    // (Latitude, Longitude)
    
    // Valuation
    pub valuation_eur: u64,
    pub valuation_timestamp: u64,
    pub valuation_oracle: String,
    
    // Documentation (Hashes)
    pub title_deed_hash: String,
    pub survey_hash: String,
    
    // Visa program
    pub visa_program_eligible: bool,
    pub minimum_investment_met: bool,
    
    // Compliance
    pub kyc_status: u8,             // 0: None, 1: Verified
    pub aml_cleared: bool,
    
    // Encumbrances
    pub mortgages: Vec<String>,     // Document hashes of mortgages
    pub liens: Vec<String>,
}
