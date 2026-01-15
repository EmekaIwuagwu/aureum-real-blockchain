use serde::{Serialize, Deserialize};
use sha3::{Digest, Keccak256};
use parity_scale_codec::{Encode, Decode};

#[derive(Debug, Serialize, Deserialize, Clone, Encode, Decode)]
pub struct Transaction {
    pub sender: String,
    pub receiver: String,
    pub amount: u64,
    pub nonce: u64,
    pub fee: u64,
    pub signature: Vec<u8>,
    pub pub_key: Vec<u8>,
    pub tx_type: TransactionType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hash: Option<String>, // Computed hash for display/querying
}

#[derive(Debug, Serialize, Deserialize, Clone, Encode, Decode)]
pub enum TransactionType {
    Transfer,
    Stake { amount: u64 },
    Unstake { amount: u64 },
    TokenizeProperty { address: String, metadata: String },
    ApplyForVisa { property_id: String, program: VisaProgram },
    ContractCreate { bytecode: Vec<u8> },
    ContractCall { target: String, data: Vec<u8> },
    RegisterCompliance { profile: crate::compliance::ComplianceProfile },
    SubmitOracleReport { report: crate::oracle::OracleReport },
    TransferFraction { property_id: String, to: String, basis_points: u64 },
    CreateMultiSig { owners: Vec<String>, threshold: u8 },
    EscrowCreate { arbiter: String, conditions: String },
    EscrowRelease { escrow_id: String },
    EscrowRefund { escrow_id: String },
}

#[derive(Debug, Serialize, Deserialize, Clone, Encode, Decode, PartialEq)]
pub enum VisaProgram {
    Portugal,
    Spain,
    Greece,
    UAE,
}

#[derive(Debug, Serialize, Deserialize, Clone, Encode, Decode, PartialEq)]
pub enum ApplicationStatus {
    Pending,
    Verified,
    Approved,
    Rejected,
}

#[derive(Debug, Serialize, Deserialize, Clone, Encode, Decode)]
pub struct VisaApplication {
    pub applicant: String,
    pub property_id: String,
    pub investment_amount: u64,
    pub program: VisaProgram,
    pub status: ApplicationStatus,
    pub timestamp: u64,
}

impl Transaction {
    pub fn hash(&self) -> String {
        let mut hasher = Keccak256::new();
        hasher.update(self.sender.as_bytes());
        hasher.update(self.receiver.as_bytes());
        hasher.update(self.amount.to_be_bytes());
        hasher.update(self.nonce.to_be_bytes());
        hasher.update(self.fee.to_be_bytes());
        hasher.update(&self.pub_key);
        hasher.update(self.tx_type.encode());
        hex::encode(hasher.finalize())
    }

    pub fn verify_signature(&self) -> bool {
        use ed25519_dalek::{VerifyingKey, Signature, Verifier};
        
        let expected_addr = generate_address(&self.pub_key);
        if expected_addr != self.sender {
            return false;
        }

        if self.pub_key.len() != 32 { return false; }
        let Ok(public_key) = VerifyingKey::from_bytes(&self.pub_key.clone().try_into().unwrap_or([0u8; 32])) else {
            return false;
        };

        let mut msg = Vec::new();
        msg.extend_from_slice(self.sender.as_bytes());
        msg.extend_from_slice(self.receiver.as_bytes());
        msg.extend_from_slice(&self.amount.to_be_bytes());
        msg.extend_from_slice(&self.nonce.to_be_bytes());
        msg.extend_from_slice(&self.fee.to_be_bytes());
        msg.extend_from_slice(&self.pub_key);
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
    Authority,
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
                timestamp: 1672531200,
                height: 0,
                state_root: "genesis".to_string(),
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
        hasher.update(self.header.state_root.as_bytes());
        hex::encode(hasher.finalize())
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
    format!("A{}", hex::encode(&result[..20]))
}

#[derive(Debug, Serialize, Deserialize, Clone, Encode, Decode)]
pub struct Property {
    pub id: String,
    pub owner: String,
    pub co_owners: Vec<(String, u64)>,
    pub jurisdiction: String,
    pub legal_description: String,
    pub coordinates: (f64, f64),
    pub valuation_eur: u64,
    pub valuation_timestamp: u64,
    pub valuation_oracle: String,
    pub title_deed_hash: String,
    pub survey_hash: String,
    pub visa_program_eligible: bool,
    pub minimum_investment_met: bool,
    pub kyc_status: u8,
    pub aml_cleared: bool,
    pub mortgages: Vec<String>,
    pub liens: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Encode, Decode)]
pub struct MultiSigAccount {
    pub address: String,
    pub owners: Vec<String>,
    pub threshold: u8,
    pub nonce: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone, Encode, Decode, PartialEq)]
pub enum EscrowStatus {
    Pending,
    Released,
    Refunded,
    Disputed,
}

#[derive(Debug, Serialize, Deserialize, Clone, Encode, Decode)]
pub struct Escrow {
    pub id: String,
    pub sender: String,
    pub receiver: String,
    pub arbiter: String,
    pub amount: u64,
    pub conditions: String,
    pub status: EscrowStatus,
    pub created_at: u64,
}

