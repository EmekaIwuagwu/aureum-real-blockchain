use sled::Db;
use crate::core::{Block, Transaction};
use parity_scale_codec::{Encode, Decode};
use std::sync::Arc;

pub struct ChainStorage {
    db: Arc<Db>,
}

impl ChainStorage {
    pub fn new(path: &str) -> Self {
        let db = sled::open(path).expect("Failed to open Sled DB");
        Self { db: Arc::new(db) }
    }

    pub fn save_block(&self, block: &Block) {
        let key = format!("block:{}", block.header.height);
        let encoded = block.encode();
        self.db.insert(key.as_bytes(), encoded).expect("Failed to save block");
        
        // Save block hash for lookup
        let hash = block.hash();
        self.db.insert(format!("hash:{}", hash).as_bytes(), &block.header.height.to_be_bytes()).expect("Failed to save hash index");
    }

    pub fn get_block(&self, height: u64) -> Option<Block> {
        let key = format!("block:{}", height);
        self.db.get(key.as_bytes()).ok()?.and_then(|data| Block::decode(&mut &data[..]).ok())
    }

    pub fn update_balance(&self, address: &str, amount: u64) {
        let key = format!("balance:{}", address);
        self.db.insert(key.as_bytes(), &amount.to_be_bytes()).expect("Failed to update balance");
    }

    pub fn get_balance(&self, address: &str) -> u64 {
        let key = format!("balance:{}", address);
        match self.db.get(key.as_bytes()).ok().flatten() {
            Some(data) => {
                let mut bytes = [0u8; 8];
                bytes.copy_from_slice(&data);
                u64::from_be_bytes(bytes)
            },
            None => 0,
        }
    }

    pub fn save_validator_set(&self, set: &crate::core::ValidatorSet) {
        let encoded = set.encode();
        self.db.insert(b"validators:current", encoded).expect("Failed to save validator set");
    }

    pub fn get_validator_set(&self) -> Option<crate::core::ValidatorSet> {
        self.db.get(b"validators:current").ok()?.and_then(|data| crate::core::ValidatorSet::decode(&mut &data[..]).ok())
    }

    pub fn save_chain_state(&self, state: &crate::core::ChainState) {
        let encoded = state.encode();
        self.db.insert(b"state:global", encoded).expect("Failed to save chain state");
    }

    pub fn get_chain_state(&self) -> Option<crate::core::ChainState> {
        self.db.get(b"state:global").ok()?.and_then(|data| crate::core::ChainState::decode(&mut &data[..]).ok())
    }

    // --- EVM State Persistence ---

    pub fn get_account_code(&self, address: &[u8; 20]) -> Vec<u8> {
        self.db.get(format!("code:{:x?}", address).as_bytes())
            .ok().flatten()
            .map(|v| v.to_vec())
            .unwrap_or_default()
    }

    pub fn save_account_code(&self, address: &[u8; 20], code: Vec<u8>) {
        self.db.insert(format!("code:{:x?}", address).as_bytes(), code).expect("Sled error");
    }

    pub fn get_storage_slot(&self, address: &[u8; 20], slot: &[u8; 32]) -> [u8; 32] {
        let key = format!("storage:{:x?}:{:x?}", address, slot);
        match self.db.get(key.as_bytes()).ok().flatten() {
            Some(data) => {
                let mut res = [0u8; 32];
                res.copy_from_slice(&data);
                res
            },
            None => [0u8; 32],
        }
    }

    pub fn save_storage_slot(&self, address: &[u8; 20], slot: &[u8; 32], value: [u8; 32]) {
        let key = format!("storage:{:x?}:{:x?}", address, slot);
        self.db.insert(key.as_bytes(), &value[..]).expect("Sled error");
    }

    // --- Property Registry ---

    pub fn save_property(&self, property: &crate::core::Property) {
        let encoded = property.encode();
        self.db.insert(format!("property:{}", property.id).as_bytes(), encoded).expect("Failed to save property");
    }

    pub fn get_property(&self, id: &str) -> Option<crate::core::Property> {
        self.db.get(format!("property:{}", id).as_bytes()).ok()?.and_then(|data| crate::core::Property::decode(&mut &data[..]).ok())
    }

    // --- Golden Visa Applications ---

    pub fn save_visa_application(&self, app: &crate::core::VisaApplication) {
        let encoded = app.encode();
        // Indexed by applicant because a user usually tracks their own visa status
        self.db.insert(format!("visa:{}", app.applicant).as_bytes(), encoded).expect("Failed to save visa application");
    }

    pub fn get_visa_application(&self, applicant: &str) -> Option<crate::core::VisaApplication> {
        self.db.get(format!("visa:{}", applicant).as_bytes()).ok()?.and_then(|data| crate::core::VisaApplication::decode(&mut &data[..]).ok())
    }
}
