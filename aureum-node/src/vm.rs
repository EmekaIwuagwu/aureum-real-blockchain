use revm::{
    primitives::{Address, U256, AccountInfo, Bytecode, B256, HashMap, Account, TransactTo, ExecutionResult, ResultAndState},
    Database,
    DatabaseCommit,
    EVM,
};
use crate::storage::ChainStorage;
use crate::compliance::ComplianceEngine;
use std::sync::Arc;

pub struct AureumDB {
    storage: Arc<ChainStorage>,
}

impl Database for AureumDB {
    type Error = String;

    fn basic(&mut self, address: Address) -> Result<Option<AccountInfo>, Self::Error> {
        let addr_bytes: [u8; 20] = address.into();
        let addr_str = format!("aur1{}", hex::encode(addr_bytes));
        let balance = self.storage.get_balance(&addr_str);
        let code = self.storage.get_account_code(addr_bytes);
        let nonce = self.storage.get_nonce(&addr_str);
        
        let (bytecode, code_hash) = if code.is_empty() {
            (None, revm::primitives::KECCAK_EMPTY)
        } else {
            let b = Bytecode::new_raw(code.into());
            (Some(b.clone()), b.hash_slow())
        };

        Ok(Some(AccountInfo {
            balance: U256::from(balance),
            nonce,
            code_hash,
            code: bytecode,
        }))
    }

    fn code_by_hash(&mut self, _code_hash: B256) -> Result<Bytecode, Self::Error> {
        Ok(Bytecode::default())
    }

    fn storage(&mut self, address: Address, index: U256) -> Result<U256, Self::Error> {
        let addr_bytes: [u8; 20] = address.into();
        let slot_bytes: [u8; 32] = index.to_be_bytes();
        let val = self.storage.get_storage_slot(addr_bytes, slot_bytes);
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
            let addr_str = format!("A{}", hex::encode(addr_bytes));
            
            self.storage.update_balance(&addr_str, account.info.balance.to::<u64>());
            
            if let Some(code) = account.info.code {
                self.storage.save_account_code(addr_bytes, code.bytes().to_vec());
            }

            for (slot, value) in account.storage {
                let slot_bytes: [u8; 32] = slot.to_be_bytes();
                let val_bytes: [u8; 32] = value.present_value().to_be_bytes();
                self.storage.save_storage_slot(addr_bytes, slot_bytes, val_bytes);
            }
        }
    }
}

pub struct AureumVM {
    storage: Arc<ChainStorage>,
    compliance: Arc<ComplianceEngine>,
}

impl AureumVM {
    pub fn new(storage: Arc<ChainStorage>, compliance: Arc<ComplianceEngine>) -> Self {
        Self { storage, compliance }
    }

    pub fn execute_transaction(&self, caller: &str, target: &str, data: Vec<u8>, value: u64) -> Result<ExecutionResult, String> {
        let mut db = AureumDB { storage: self.storage.clone() };
        
        let caller_addr = self.parse_address(caller)?;
        let mut evm = EVM::new();
        evm.database(&mut db);
        
        // Context setup
        evm.env.tx.caller = caller_addr;
        evm.env.tx.data = data.into();
        evm.env.tx.value = U256::from(value);
        evm.env.tx.gas_limit = 10_000_000;
        evm.env.tx.gas_price = U256::from(1);
        
        if target == "0" || target.is_empty() || target == "0x0000000000000000000000000000000000000000" {
            evm.env.tx.transact_to = TransactTo::Create(revm::primitives::CreateScheme::Create);
        } else {
            evm.env.tx.transact_to = TransactTo::Call(self.parse_address(target)?);
        }

        let ResultAndState { result, state } = evm.transact().map_err(|e| format!("EVM Error: {:?}", e))?;
        
        match result {
            ExecutionResult::Success { .. } => {
                db.commit(state);
                Ok(result)
            }
            _ => Err(format!("Execution failed: {:?}", result)),
        }
    }

    pub fn execute_call(&self, caller: &str, target: &str, data: Vec<u8>, value: u64) -> Result<Vec<u8>, String> {
        let mut db = AureumDB { storage: self.storage.clone() };
        let caller_addr = self.parse_address(caller)?;
        let target_addr = self.parse_address(target)?;
        
        let mut evm = EVM::new();
        evm.database(&mut db);
        
        evm.env.tx.caller = caller_addr;
        evm.env.tx.transact_to = TransactTo::Call(target_addr);
        evm.env.tx.data = data.into();
        evm.env.tx.value = U256::from(value);
        evm.env.tx.gas_limit = 10_000_000;

        let ResultAndState { result, .. } = evm.transact().map_err(|e| format!("EVM Error: {:?}", e))?;
        
        match result {
            ExecutionResult::Success { output, .. } => Ok(output.into_data().to_vec()),
            _ => Err(format!("Call failed: {:?}", result)),
        }
    }

    fn parse_address(&self, addr: &str) -> Result<Address, String> {
        let clean = addr.replace("A", "").replace("aur1", "").replace("0x", "");
        let bytes = hex::decode(clean).map_err(|e| e.to_string())?;
        if bytes.len() != 20 {
            return Err("Invalid address length".to_string());
        }
        let mut arr = [0u8; 20];
        arr.copy_from_slice(&bytes);
        Ok(Address::from(arr))
    }

    pub fn verify_compliance(&self, tx: &crate::core::Transaction) -> bool {
        let current_time = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
        
        // Default to Global jurisdiction for simple transfers
        let jurisdiction = match &tx.tx_type {
            crate::core::TransactionType::ApplyForVisa { program, .. } => {
                match program {
                    crate::core::VisaProgram::Portugal => crate::compliance::Jurisdiction::Portugal,
                    crate::core::VisaProgram::UAE => crate::compliance::Jurisdiction::UAE,
                    _ => crate::compliance::Jurisdiction::Global,
                }
            }
            _ => crate::compliance::Jurisdiction::Global,
        };

        self.compliance.verify_transaction(&tx.sender, &tx.receiver, tx.amount, jurisdiction, current_time)
    }
}
