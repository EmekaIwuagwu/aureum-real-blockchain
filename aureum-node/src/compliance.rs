use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use log::{info, warn};

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum Jurisdiction {
    Portugal,
    UAE,
    UK,
    Global,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ComplianceProfile {
    pub address: String,
    pub jurisdiction: Jurisdiction,
    pub kyc_level: u8, // 0: None, 1: Basic, 2: Institutional
    pub is_verified: bool,
    pub last_updated: u64,
}

pub struct ComplianceEngine {
    // In a real implementation, this would be backed by a Merkle Patricia Trie
    profiles: HashMap<String, ComplianceProfile>,
    jurisdiction_rules: HashMap<Jurisdiction, JurisdictionRules>,
}

#[derive(Clone)]
pub struct JurisdictionRules {
    pub min_kyc_level: u8,
    pub max_transfer_amount: u64,
    pub holding_period_sec: u64,
}

impl ComplianceEngine {
    pub fn new() -> Self {
        let mut jurisdiction_rules = HashMap::new();
        
        // Define Institutional Rules for Portugal (Golden Visa compliant)
        jurisdiction_rules.insert(Jurisdiction::Portugal, JurisdictionRules {
            min_kyc_level: 2,
            max_transfer_amount: 10_000_000_000,
            holding_period_sec: 157_680_000, // 5 years for golden visa
        });

        // Define Rules for UAE
        jurisdiction_rules.insert(Jurisdiction::UAE, JurisdictionRules {
            min_kyc_level: 1,
            max_transfer_amount: u64::MAX,
            holding_period_sec: 0,
        });

        Self {
            profiles: HashMap::new(),
            jurisdiction_rules,
        }
    }

    pub fn register_profile(&mut self, profile: ComplianceProfile) {
        info!("Registering compliance profile for {}", profile.address);
        self.profiles.insert(profile.address.clone(), profile);
    }

    pub fn verify_transaction(&self, from: &str, to: &str, amount: u64, jurisdiction: Jurisdiction) -> bool {
        let from_profile = self.profiles.get(from);
        let rules = self.jurisdiction_rules.get(&jurisdiction).unwrap();

        // 1. Check KYC Level
        if let Some(profile) = from_profile {
            if !profile.is_verified || profile.kyc_level < rules.min_kyc_level {
                warn!("Compliance Reject: Insufficient KYC for {}", from);
                return false;
            }

            // 2. Check Holding Period (Simulated)
            // if profile.last_updated + rules.holding_period_sec > current_time { ... }

            // 3. Check Amount Limits
            if amount > rules.max_transfer_amount {
                warn!("Compliance Reject: Amount exceeds jurisdiction limit");
                return false;
            }

            info!("Compliance Approval: Tx from {} to {} verified", from, to);
            true
        } else {
            warn!("Compliance Reject: Sender profile not found for {}", from);
            false
        }
    }
}
