use revm::{
    db::{CacheDB, EmptyDB},
    primitives::{address, Address, Bytes, TransactTo, U256, ExecutionResult, Env, ResultAndState, AccountInfo, Bytecode, B256, Account},
    EVM,
    Database,
    DatabaseCommit,
};
use crate::storage::ChainStorage;
use std::sync::Arc;
use log::{info, error, warn};

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
    fn commit(&mut self, changes: std::collections::HashMap<Address, Account>) {
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
    pub fn execute_transaction(&self, caller: &str, target: &str, data: Vec<u8>, value: u64) -> Result<ExecutionResult, String> {
        let mut db = AureumDB { storage: self.storage.clone() };
        
        let mut evm = EVM::new();
        evm.database(&mut db);
        
        evm.env.tx.caller = Address::parse_checksummed(caller, None).map_err(|e| e.to_string())?;
        evm.env.tx.transact_to = TransactTo::Call(
            Address::parse_checksummed(target, None).map_err(|e| e.to_string())?
        );
        evm.env.tx.data = data.into();
        evm.env.tx.value = U256::from(value);
        evm.env.tx.gas_limit = 1_000_000;
        
        let result = evm.transact().map_err(|e| format!("EVM Error: {:?}", e))?;
        
        // COMMIT changes to Sled
        db.commit(result.state);
        
        Ok(result.result)
    }

    /// Read-only call against the state
    pub fn execute_call(&self, caller: &str, target: &str, data: Vec<u8>, value: u64) -> Result<ExecutionResult, String> {
        let mut db = AureumDB { storage: self.storage.clone() };
        let mut evm = EVM::new();
        evm.database(&mut db);
        
        evm.env.tx.caller = Address::parse_checksummed(caller, None).map_err(|e| e.to_string())?;
        evm.env.tx.transact_to = TransactTo::Call(
            Address::parse_checksummed(target, None).map_err(|e| e.to_string())?
        );
        evm.env.tx.data = data.into();
        evm.env.tx.value = U256::from(value);
        
        let result = evm.transact().map_err(|e| format!("EVM Error: {:?}", e))?;
        Ok(result.result)
    }

    pub fn verify_compliance(&self, _tx_data: &[u8]) -> bool {
        true
    }
}
