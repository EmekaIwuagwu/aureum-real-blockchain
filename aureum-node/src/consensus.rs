use serde::{Serialize, Deserialize};
use parity_scale_codec::{Encode, Decode};
use crate::core::{Block, ValidatorSet, ValidatorRole};
use std::collections::{HashMap, HashSet};
use log::{info, warn, error};

#[derive(Debug, Serialize, Deserialize, Clone, Encode, Decode, PartialEq, Eq, Hash)]
pub enum BftStep {
    Propose,
    Prevote,
    Precommit,
    Commit,
}

#[derive(Debug, Serialize, Deserialize, Clone, Encode, Decode)]
pub struct BftMessage {
    pub height: u64,
    pub round: u32,
    pub step: BftStep,
    pub block_hash: Option<String>,
    pub validator: String,
    pub signature: Vec<u8>,
}

pub struct ConsensusEngine {
    pub height: u64,
    pub round: u32,
    pub step: BftStep,
    pub validator_set: ValidatorSet,
    pub votes: HashMap<(u64, u32, BftStep), Vec<BftMessage>>,
    pub proposal: Option<Block>,
    pub locked_block: Option<(u32, Block)>, // (round, block)
    pub authority_veto_active: bool,
}

impl ConsensusEngine {
    pub fn new(validator_set: ValidatorSet) -> Self {
        Self {
            height: 1,
            round: 0,
            step: BftStep::Propose,
            validator_set,
            votes: HashMap::new(),
            proposal: None,
            locked_block: None,
            authority_veto_active: true,
        }
    }

    pub fn select_proposer(&self) -> String {
        if self.validator_set.validators.is_empty() {
            return "".to_string();
        }

        let mut sorted_vals = self.validator_set.validators.clone();
        sorted_vals.sort_by(|a, b| a.address.cmp(&b.address));

        let total_stake = self.validator_set.total_stake;
        if total_stake == 0 { return sorted_vals[0].address.clone(); }

        let index_seed = (self.height + self.round as u64) % total_stake;
        let mut current_sum = 0;

        for val in sorted_vals {
            current_sum += val.stake;
            if index_seed < current_sum {
                return val.address;
            }
        }

        self.validator_set.validators[0].address.clone()
    }

    pub fn process_message(&mut self, msg: BftMessage) -> bool {
        if msg.height != self.height || msg.round < self.round {
            return false;
        }

        let key = (msg.height, msg.round, msg.step.clone());
        let step_votes = self.votes.entry(key).or_insert(vec![]);
        
        // Check for double voting
        if step_votes.iter().any(|v| v.validator == msg.validator) {
            warn!("Validator {} double voted in step {:?}", msg.validator, msg.step);
            return false;
        }

        step_votes.push(msg);
        self.check_quasi_finality(self.round, self.step.clone())
    }

    pub fn set_proposal(&mut self, block: Block) {
        if block.header.height == self.height {
            self.proposal = Some(block);
        }
    }

    fn check_quasi_finality(&self, round: u32, step: BftStep) -> bool {
        let key = (self.height, round, step);
        let votes = match self.votes.get(&key) {
            Some(v) => v,
            None => return false,
        };

        let mut authority_approvals = 0;
        let authority_nodes = self.validator_set.get_authority_nodes();
        
        // Use a set to track unique validators who voted for the SAME hash (or any hash for prevote/precommit skip)
        // For simplicity, we check if 2/3 voted for the SAME hash if it's Precommit
        let mut hash_counts: HashMap<Option<String>, u64> = HashMap::new();
        let mut unique_validators = HashSet::new();

        for vote in votes {
            if unique_validators.contains(&vote.validator) { continue; }
            
            if let Some(v) = self.validator_set.validators.iter().find(|val| val.address == vote.validator) {
                let count = hash_counts.entry(vote.block_hash.clone()).or_insert(0);
                *count += v.stake;
                unique_validators.insert(vote.validator.clone());
                
                if v.role == ValidatorRole::Authority {
                    authority_approvals += 1;
                }
            }
        }

        for (_hash, stake) in hash_counts {
            let has_2_3_stake = stake >= (self.validator_set.total_stake * 2 / 3);
            let authority_veto_pass = if self.authority_veto_active && !authority_nodes.is_empty() {
                authority_approvals > 0 
            } else {
                true
            };

            if has_2_3_stake && authority_veto_pass {
                return true;
            }
        }

        false
    }

    pub fn next_step(&mut self, storage: &crate::storage::ChainStorage, block: Option<&Block>) {
        let is_single_validator = self.validator_set.validators.len() == 1;
        
        match self.step {
            BftStep::Propose => {
                if is_single_validator || self.proposal.is_some() || self.round > 0 {
                    self.step = BftStep::Prevote;
                }
            },
            BftStep::Prevote => {
                // Single-validator testnet: auto-approve
                if is_single_validator || self.check_quasi_finality(self.round, BftStep::Prevote) {
                    self.step = BftStep::Precommit;
                } else {
                    // Timeout or missed prevotes: could stay here or move to next round
                }
            },
            BftStep::Precommit => {
                // Single-validator testnet: auto-approve
                if is_single_validator || self.check_quasi_finality(self.round, BftStep::Precommit) {
                    self.step = BftStep::Commit;
                }
            },
            BftStep::Commit => {
                if let Some(b) = block {
                    self.process_block_finalization(storage, b);
                }
                
                self.height += 1;
                self.round = 0;
                self.step = BftStep::Propose;
                self.votes.clear();
                self.proposal = None;
                info!("Consensus: Height {} Finalized", self.height - 1);
            }
        }
    }

    fn process_block_finalization(&mut self, storage: &crate::storage::ChainStorage, block: &Block) {
        let total_fees: u64 = block.transactions.iter().map(|tx| tx.fee).sum();
        let burn_amount = total_fees / 2;
        let validator_reward = total_fees - burn_amount;

        if let Some(mut state) = storage.get_chain_state() {
            state.total_supply -= burn_amount;
            state.burned_fees += burn_amount;
            storage.save_chain_state(&state);
        }

        self.distribute_rewards(storage, validator_reward);
        self.check_downtime_slashing(storage);
    }

    fn distribute_rewards(&mut self, storage: &crate::storage::ChainStorage, reward: u64) {
        if self.validator_set.validators.is_empty() { return; }
        
        let share = (reward + 100) / self.validator_set.validators.len() as u64; // Base 100 AUR
        for validator in &mut self.validator_set.validators {
            validator.stake += share;
            let bal = storage.get_balance(&validator.address);
            storage.update_balance(&validator.address, bal + share);
        }
        self.validator_set.total_stake += reward + 100;
        storage.save_validator_set(&self.validator_set);
    }

    fn check_downtime_slashing(&mut self, storage: &crate::storage::ChainStorage) {
        let current_height = self.height;
        let mut slashed = false;
        
        for val in &mut self.validator_set.validators {
            // Simple logic: if validator hasn't been active for 100 blocks, slash 1%
            if current_height > val.last_active + 100 && val.stake > 1000 {
                let penalty = val.stake / 100; // 1% slash
                val.stake -= penalty;
                self.validator_set.total_stake -= penalty;
                
                let current_bal = storage.get_balance(&val.address);
                storage.update_balance(&val.address, current_bal.saturating_sub(penalty));
                
                warn!("Slashing validator {} for downtime: -{} AUR", val.address, penalty);
                slashed = true;
            }
        }
        
        if slashed {
            storage.save_validator_set(&self.validator_set);
        }
    }

    pub fn detect_equivocation(&mut self, msg: &BftMessage, storage: &crate::storage::ChainStorage) -> bool {
        let key = (msg.height, msg.round, msg.step.clone());
        if let Some(votes) = self.votes.get(&key) {
            for vote in votes {
                if vote.validator == msg.validator && vote.block_hash != msg.block_hash {
                    error!("CRITICAL: Malicious Equivocation detected by {} at height {}", msg.validator, msg.height);
                    self.slash_validator(&msg.validator, 0.50, storage); // 50% slash for malicious behavior
                    return true;
                }
            }
        }
        false
    }

    fn slash_validator(&mut self, address: &str, percentage: f64, storage: &crate::storage::ChainStorage) {
        if let Some(val) = self.validator_set.validators.iter_mut().find(|v| v.address == address) {
            let penalty = (val.stake as f64 * percentage) as u64;
            val.stake = val.stake.saturating_sub(penalty);
            self.validator_set.total_stake = self.validator_set.total_stake.saturating_sub(penalty);
            
            let current_bal = storage.get_balance(address);
            storage.update_balance(address, current_bal.saturating_sub(penalty));
            storage.save_validator_set(&self.validator_set);
            
            warn!("Institutional Slash: {} penalized by {}% (-{} AUR)", address, percentage * 100.0, penalty);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::{Validator, ValidatorRole, ValidatorSet};

    fn setup_engine() -> ConsensusEngine {
        let vals = vec![
            Validator { address: "val1".into(), public_key: vec![], stake: 100, role: ValidatorRole::Authority, last_active: 0 },
            Validator { address: "val2".into(), public_key: vec![], stake: 100, role: ValidatorRole::Standard, last_active: 0 },
            Validator { address: "val3".into(), public_key: vec![], stake: 100, role: ValidatorRole::Standard, last_active: 0 },
        ];
        ConsensusEngine::new(ValidatorSet { validators: vals, total_stake: 300 })
    }

    #[test]
    fn test_honest_consensus() {
        let mut engine = setup_engine();
        assert_eq!(engine.step, BftStep::Propose);
        
        let hash = Some("hash1".into());
        
        // Round 0 Prevotes
        engine.process_message(BftMessage { height: 1, round: 0, step: BftStep::Prevote, block_hash: hash.clone(), validator: "val1".into(), signature: vec![] });
        engine.process_message(BftMessage { height: 1, round: 0, step: BftStep::Prevote, block_hash: hash.clone(), validator: "val2".into(), signature: vec![] });
        
        assert!(engine.check_quasi_finality(0, BftStep::Prevote));
    }

    #[test]
    fn test_authority_veto() {
        let mut engine = setup_engine();
        let hash = Some("hash1".into());

        // val2 and val3 has 2/3 stake (200/300)
        engine.process_message(BftMessage { height: 1, round: 0, step: BftStep::Prevote, block_hash: hash.clone(), validator: "val2".into(), signature: vec![] });
        engine.process_message(BftMessage { height: 1, round: 0, step: BftStep::Prevote, block_hash: hash.clone(), validator: "val3".into(), signature: vec![] });

        // Should FAIL despite 2/3 stake because NO authority (val1) approved
        assert!(!engine.check_quasi_finality(0, BftStep::Prevote));
        
        // Now val1 votes
        engine.process_message(BftMessage { height: 1, round: 0, step: BftStep::Prevote, block_hash: hash.clone(), validator: "val1".into(), signature: vec![] });
        assert!(engine.check_quasi_finality(0, BftStep::Prevote));
    }
}
