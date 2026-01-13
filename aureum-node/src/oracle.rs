use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use std::sync::Arc;
use crate::storage::ChainStorage;
use log::{info, warn};
use parity_scale_codec::{Encode, Decode};

#[derive(Debug, Serialize, Deserialize, Clone, Encode, Decode)]
pub struct OracleReport {
    pub asset_id: String,
    pub price_eur: u64,
    pub timestamp: u64,
    pub reporter: String,
    pub signature: Vec<u8>,
    pub pub_key: Vec<u8>,
}

pub struct AureumOracle {
    storage: Arc<ChainStorage>,
    // Track reports to reaches 2/3 agreement
    pending_reports: HashMap<String, Vec<OracleReport>>,
    authorized_reporters: Vec<String>,
}

impl AureumOracle {
    pub fn new(storage: Arc<ChainStorage>, reporters: Vec<String>) -> Self {
        Self {
            storage,
            pending_reports: HashMap::new(),
            authorized_reporters: reporters,
        }
    }

    pub fn submit_report(&mut self, report: OracleReport) {
        if !self.authorized_reporters.contains(&report.reporter) {
            warn!("Institutional Security: Unauthorized oracle report from {}", report.reporter);
            return;
        }

        // Cryptographic Verification
        if !self.verify_report_signature(&report) {
            warn!("Institutional Security: INVALID signature from oracle reporter {}", report.reporter);
            return;
        }

        let reports = self.pending_reports.entry(report.asset_id.clone()).or_insert(vec![]);
        
        if reports.iter().any(|r| r.reporter == report.reporter) {
            return;
        }

        reports.push(report.clone());

        // Consensus: require at least 2 reports and more than 50% of authorized reporters
        let threshold = (self.authorized_reporters.len() / 2) + 1;
        if reports.len() >= threshold {
            self.finalize_price(&report.asset_id);
        }
    }

    fn verify_report_signature(&self, report: &OracleReport) -> bool {
        use ed25519_dalek::{VerifyingKey, Signature, Verifier};
        
        let expected_addr = crate::core::generate_address(&report.pub_key);
        if expected_addr != report.reporter {
            return false;
        }

        if report.pub_key.len() != 32 { return false; }
        let verifying_key = match VerifyingKey::from_bytes(&report.pub_key.clone().try_into().unwrap_or([0u8; 32])) {
            Ok(vk) => vk,
            Err(_) => return false,
        };

        let mut msg = Vec::new();
        msg.extend_from_slice(report.asset_id.as_bytes());
        msg.extend_from_slice(&report.price_eur.to_be_bytes());
        msg.extend_from_slice(&report.timestamp.to_be_bytes());
        msg.extend_from_slice(&report.pub_key);

        let signature = match Signature::from_slice(&report.signature) {
            Ok(sig) => sig,
            Err(_) => return false,
        };

        verifying_key.verify(&msg, &signature).is_ok()
    }

    fn finalize_price(&mut self, asset_id: &str) {
        let reports = self.pending_reports.get(asset_id).unwrap();
        
        // Use median price or average for simplicity
        let mut prices: Vec<u64> = reports.iter().map(|r| r.price_eur).collect();
        prices.sort_unstable();
        
        let finalized_price = prices[prices.len() / 2]; // Median

        info!("Oracle Price Finalized for {}: €{}", asset_id, finalized_price);
        self.storage.save_oracle_price(asset_id, finalized_price);
        self.pending_reports.remove(asset_id);
    }

    pub fn get_price(&self, asset_id: &str) -> Option<u64> {
        self.storage.get_oracle_price(asset_id)
    }
}
