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
}
