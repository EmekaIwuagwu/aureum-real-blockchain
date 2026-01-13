use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use log::{info, warn};
use std::sync::Arc;
use crate::storage::ChainStorage;
use parity_scale_codec::{Encode, Decode};

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq, Hash, Encode, Decode)]
pub enum Jurisdiction {
    Portugal,
    UAE,
    UK,
    Global,
}

#[derive(Debug, Serialize, Deserialize, Clone, Encode, Decode)]
pub struct ComplianceProfile {
    pub address: String,
    pub jurisdiction: Jurisdiction,
    pub kyc_level: u8, // 0: None, 1: Basic, 2: Institutional
    pub is_verified: bool,
    pub last_updated: u64,
}

pub struct ComplianceEngine {
    storage: Arc<ChainStorage>,
    jurisdiction_rules: HashMap<Jurisdiction, JurisdictionRules>,
}

#[derive(Clone)]
pub struct JurisdictionRules {
    pub min_kyc_level: u8,
    pub max_transfer_amount: u64,
    pub holding_period_sec: u64,
}

impl ComplianceEngine {
    pub fn new(storage: Arc<ChainStorage>) -> Self {
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
            storage,
            jurisdiction_rules,
        }
    }

    pub fn register_profile(&self, profile: ComplianceProfile) {
        info!("Registering compliance profile for {}", profile.address);
        self.storage.save_compliance_profile(&profile);
    }

    pub fn verify_transaction(&self, from: &str, _to: &str, amount: u64, jurisdiction: Jurisdiction, current_time: u64) -> bool {
        let from_profile = self.storage.get_compliance_profile(from);
        let rules = self.jurisdiction_rules.get(&jurisdiction).unwrap_or(&JurisdictionRules {
            min_kyc_level: 0,
            max_transfer_amount: u64::MAX,
            holding_period_sec: 0,
        });

        // 1. Check KYC Level
        if let Some(profile) = from_profile {
            if !profile.is_verified || profile.kyc_level < rules.min_kyc_level {
                warn!("Institutional Reject: KYC Level {} < Required {} for {}", profile.kyc_level, rules.min_kyc_level, from);
                return false;
            }

            // 2. Check Holding Period for institutional assets (Golden Visa compliance)
            if profile.last_updated + rules.holding_period_sec > current_time {
                let remaining = (profile.last_updated + rules.holding_period_sec) - current_time;
                warn!("Institutional Reject: Asset locked for Golden Visa compliance. {}s remaining", remaining);
                return false;
            }

            // 3. Check Amount Limits
            if amount > rules.max_transfer_amount {
                warn!("Institutional Reject: Amount {} exceeds €{} limit for {:?}", amount, rules.max_transfer_amount, jurisdiction);
                return false;
            }

            info!("Institutional Approval: COMPLIANT tx from {} in jurisdiction {:?}", from, jurisdiction);
            true
        } else {
            // Default: If no profile exists, only allow small transfers globally
            if jurisdiction == Jurisdiction::Global && amount < 1000000 { // Allow up to 1M AUR for non-institutional
                return true;
            }
            warn!("Institutional Reject: No compliance profile found for {}", from);
            false
        }
    }
}
