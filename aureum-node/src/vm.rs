use revm::{
    primitives::{Address, U256, AccountInfo, Bytecode, B256, HashMap, TxEnv, Env, TransactTo},
    Database,
    DatabaseCommit,
};
use crate::storage::ChainStorage;
use std::sync::Arc;

pub struct AureumDB {
    storage: Arc<ChainStorage>,
}

impl Database for AureumDB {
    type Error = String;

    fn basic(&mut self, address: Address) -> Result<Option<AccountInfo>, Self::Error> {
        let addr_bytes: [u8; 20] = address.into();
        let balance = self.storage.get_balance(&format!("0x{:x?}", addr_bytes));
        let code = self.storage.get_account_code(&addr_bytes);
        
        Ok(Some(AccountInfo {
            balance: U256::from(balance),
            nonce: 0, // Simplified for now
            code_hash: B256::from_slice(&[0u8; 32]), // Future: hash
            code: if code.is_empty() { None } else { Some(Bytecode::new_raw(code.into())) },
        }))
    }

    fn code_by_hash(&mut self, _code_hash: B256) -> Result<Bytecode, Self::Error> {
        Ok(Bytecode::default())
    }

    fn storage(&mut self, address: Address, index: U256) -> Result<U256, Self::Error> {
        let addr_bytes: [u8; 20] = address.into();
        let slot_bytes: [u8; 32] = index.to_be_bytes();
        let val = self.storage.get_storage_slot(&addr_bytes, &slot_bytes);
        Ok(U256::from_be_bytes(val))
    }

    fn block_hash(&mut self, _number: U256) -> Result<B256, Self::Error> {
        Ok(B256::default())
    }
}

impl DatabaseCommit for AureumDB {
    fn commit(&mut self, changes: HashMap<Address, Account>) {
        for (address, account) in changes {
            let addr_bytes: [u8; 20] = address.into();
            
            // Save balance
            self.storage.update_balance(&format!("0x{:x?}", addr_bytes), account.info.balance.to::<u64>());
            
            // Save code if changed
            if let Some(code) = account.info.code {
                self.storage.save_account_code(&addr_bytes, code.bytes().to_vec());
            }

            // Save storage
            for (slot, value) in account.storage {
                let slot_bytes: [u8; 32] = slot.to_be_bytes();
                let val_bytes: [u8; 32] = value.present_value().to_be_bytes();
                self.storage.save_storage_slot(&addr_bytes, &slot_bytes, val_bytes);
            }
        }
    }
}

pub struct AureumVM {
    storage: Arc<ChainStorage>,
}

impl AureumVM {
    pub fn new(storage: Arc<ChainStorage>) -> Self {
        Self { storage }
    }

    /// Execute and COMMIT a transaction to the persistent blockchain state
    /// Simplified implementation - full EVM integration pending
    pub fn execute_transaction(&self, caller: &str, target: &str, data: Vec<u8>, value: u64) -> Result<Vec<u8>, String> {
        // For now, this is a placeholder that allows the node to compile
        // Full revm integration requires:
        // 1. Proper Builder pattern for EVM in revm 3.x
        // 2. State management through our AureumDB
        // 3. Gas metering and limits
        
        // Basic validation
        if target == "0x0000000000000000000000000000000000000000" {
            // Contract deployment
            let contract_addr = crate::core::generate_address(&data);
            let mut db = AureumDB { storage: self.storage.clone() };
            
            // Store bytecode
            if let Ok(addr_bytes) = hex::decode(contract_addr.trim_start_matches("0x")) {
                if addr_bytes.len() == 20 {
                    let mut addr_arr = [0u8; 20];
                    addr_arr.copy_from_slice(&addr_bytes);
                    db.storage.save_account_code(&addr_arr, data.clone());
                }
            }
            
            Ok(contract_addr.as_bytes().to_vec())
        } else {
            // Contract call - simplified
            Ok(vec![])
        }
    }

    /// Read-only call against the state
    pub fn execute_call(&self, _caller: &str, _target: &str, _data: Vec<u8>, _value: u64) -> Result<Vec<u8>, String> {
        // Placeholder for read-only EVM calls
        Ok(vec![])
    }

    pub fn verify_compliance(&self, _tx_data: &[u8]) -> bool {
        true
    }
}
