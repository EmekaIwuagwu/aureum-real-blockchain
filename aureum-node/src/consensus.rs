use serde::{Serialize, Deserialize};
use parity_scale_codec::{Encode, Decode};
use crate::core::{Block, ValidatorSet, ValidatorRole};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use log::{info, warn, error};

#[derive(Debug, Serialize, Deserialize, Clone, Encode, Decode, PartialEq)]
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
    pub votes: HashMap<BftStep, Vec<BftMessage>>,
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
            authority_veto_active: true, // Default to true for Aureum compliance
        }
    }

    pub fn process_message(&mut self, msg: BftMessage) {
        if msg.height != self.height {
            return;
        }

        let step_votes = self.votes.entry(msg.step.clone()).or_insert(vec![]);
        step_votes.push(msg);

        self.check_quasi_finality();
    }

    /// Hybrid BFT: 2/3 Total Stake + Authority Node Veto Right
    fn check_quasi_finality(&mut self) -> bool {
        let step_votes = self.votes.get(&self.step);
        if step_votes.is_none() { return false; }
        let votes = step_votes.unwrap();

        let mut voted_stake = 0;
        let mut authority_approvals = 0;
        let authority_nodes = self.validator_set.get_authority_nodes();
        let total_authority_nodes = authority_nodes.len();

        for vote in votes {
            if let Some(v) = self.validator_set.validators.iter().find(|val| val.address == vote.validator) {
                voted_stake += v.stake;
                if v.role == ValidatorRole::Authority {
                    authority_approvals += 1;
                }
            }
        }

        let has_2_3_stake = voted_stake >= (self.validator_set.total_stake * 2 / 3);
        
        // Aureum Specific: At least one Authority Node must approve for critical steps
        // (In a full implementation, this could be a 51% of authority nodes)
        let authority_veto_pass = if self.authority_veto_active && total_authority_nodes > 0 {
            authority_approvals > 0 
        } else {
            true
        };

        if has_2_3_stake && authority_veto_pass {
            info!("Step {:?} reached consensus for height {}", self.step, self.height);
            return true;
        }

        false
    }

    pub fn next_step(&mut self, storage: &crate::storage::ChainStorage, block: Option<&crate::core::Block>) {
        match self.step {
            BftStep::Propose => self.step = BftStep::Prevote,
            BftStep::Prevote => self.step = BftStep::Precommit,
            BftStep::Precommit => self.step = BftStep::Commit,
            BftStep::Commit => {
                // Finalized! Process economics
                if let Some(b) = block {
                    let total_fees: u64 = b.transactions.iter().map(|tx| tx.fee).sum();
                    self.process_block_economics(storage, total_fees);
                } else {
                    self.distribute_rewards(storage, 0);
                }
                
                self.check_downtime_slashing(storage);

                self.height += 1;
                self.round = 0;
                self.step = BftStep::Propose;
                self.votes.clear();
                
                info!("Height {} finalized. Moving to Propose for {}", self.height - 1, self.height);
            }
        }
    }

    fn process_block_economics(&mut self, storage: &crate::storage::ChainStorage, total_fees: u64) {
        let burn_amount = total_fees / 2;
        let validator_reward = total_fees - burn_amount;

        // Update Global State: Burn total supply
        let mut state = storage.get_chain_state().unwrap_or(crate::core::ChainState { total_supply: 21_000_000_000, burned_fees: 0 });
        state.total_supply -= burn_amount;
        state.burned_fees += burn_amount;
        storage.save_chain_state(&state);

        info!("Institutional Burn: {} AUR permanently removed. Total Burned: {} AUR", burn_amount, state.burned_fees);
        
        self.distribute_rewards(storage, validator_reward);
    }

    fn distribute_rewards(&mut self, storage: &crate::storage::ChainStorage, additional_fees: u64) {
        let base_reward = 100; // Fixed AUR emission
        let total_pool = base_reward + additional_fees;
        
        let active_validators_count = self.validator_set.validators.len();
        if active_validators_count == 0 { return; }

        let share = total_pool / active_validators_count as u64;
        
        for validator in &mut self.validator_set.validators {
            validator.stake += share;
            storage.update_balance(&validator.address, storage.get_balance(&validator.address) + share);
        }
        
        self.validator_set.total_stake += total_pool;
        storage.save_validator_set(&self.validator_set);
        info!("Distributed block rewards & fee shares: {} AUR per validator", share);
    }

    fn check_downtime_slashing(&mut self, storage: &crate::storage::ChainStorage) {
        // Simple logic: if a validator didn't vote in the last Commit, penalize them
        let commit_votes = self.votes.get(&BftStep::Commit).cloned().unwrap_or_default();
        let mut slashed = false;

        for validator in &mut self.validator_set.validators {
            let voted = commit_votes.iter().any(|v| v.validator == validator.address);
            if !voted && validator.stake > 1000 {
                let penalty = (validator.stake as f64 * 0.01) as u64; // 1% slash for downtime
                validator.stake -= penalty;
                self.validator_set.total_stake -= penalty;
                slashed = true;
                warn!("Slashing validator {} for downtime: -{} AUR", validator.address, penalty);
            }
        }

        if slashed {
            storage.save_validator_set(&self.validator_set);
        }
    }
}
