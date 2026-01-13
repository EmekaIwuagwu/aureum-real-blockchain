use aureum_node::core::{Transaction, TransactionType, VisaProgram, Validator, ValidatorRole, ValidatorSet, Block, BlockHeader};
use aureum_node::storage::ChainStorage;
use aureum_node::vm::AureumVM;
use aureum_node::compliance::{ComplianceEngine, ComplianceProfile, Jurisdiction};
use aureum_node::consensus::{ConsensusEngine, BftStep};
use ed25519_dalek::{SigningKey, Signer};
use rand_core::OsRng;
use std::sync::Arc;
use parity_scale_codec::Encode;

#[tokio::test]
async fn test_institutional_workflow() {
    // 1. Setup Environment
    let db_path = "test_data/institutional_e2e_db";
    let _ = std::fs::remove_dir_all(db_path);
    let storage = Arc::new(ChainStorage::new(db_path));
    let compliance = Arc::new(ComplianceEngine::new(storage.clone()));
    let vm = AureumVM::new(storage.clone(), compliance.clone());

    // 2. Setup Identities
    let mut csprng = OsRng;
    let institution_key = SigningKey::generate(&mut csprng);
    let institution_addr = aureum_node::core::generate_address(institution_key.verifying_key().as_bytes());
    
    let investor_key = SigningKey::generate(&mut csprng);
    let investor_addr = aureum_node::core::generate_address(investor_key.verifying_key().as_bytes());

    // 3. Setup Compliance Profiles
    compliance.register_profile(ComplianceProfile {
        address: institution_addr.clone(),
        jurisdiction: Jurisdiction::Portugal,
        kyc_level: 2, // Institutional
        is_verified: true,
        last_updated: 0,
    });

    compliance.register_profile(ComplianceProfile {
        address: investor_addr.clone(),
        jurisdiction: Jurisdiction::Portugal,
        kyc_level: 2, // Also institutional for this test
        is_verified: true,
        last_updated: 0,
    });

    // Seed balances
    storage.update_balance(&institution_addr, 10_000_000_000); // 10B AUR

    // 4. Create Institutional Transfer Transaction
    let mut tx = Transaction {
        sender: institution_addr.clone(),
        receiver: investor_addr.clone(),
        amount: 1_000_000_000, // 1B AUR
        nonce: 0,
        fee: 1000,
        signature: vec![],
        pub_key: institution_key.verifying_key().to_bytes().to_vec(),
        tx_type: TransactionType::ApplyForVisa { 
            property_id: "prop_golden_1".to_string(), 
            program: VisaProgram::Portugal 
        },
    };

    // Sign
    let mut msg = Vec::new();
    msg.extend_from_slice(tx.sender.as_bytes());
    msg.extend_from_slice(tx.receiver.as_bytes());
    msg.extend_from_slice(&tx.amount.to_be_bytes());
    msg.extend_from_slice(&tx.nonce.to_be_bytes());
    msg.extend_from_slice(&tx.fee.to_be_bytes());
    msg.extend_from_slice(&tx.pub_key);
    msg.extend_from_slice(&tx.tx_type.encode());
    tx.signature = institution_key.sign(&msg).to_vec();

    // 5. Verify Compliance & Sig
    assert!(tx.verify_signature());
    assert!(vm.verify_compliance(&tx));

    // 6. Simulate Consensus Finalization
    let val_set = ValidatorSet {
        validators: vec![Validator {
            address: "val1".into(),
            public_key: vec![],
            stake: 1000,
            role: ValidatorRole::Authority,
            last_active: 0,
        }],
        total_stake: 1000,
    };
    let mut engine = ConsensusEngine::new(val_set);
    
    let block = Block {
        header: BlockHeader {
            parent_hash: "0".into(),
            timestamp: 1672531200,
            height: 1,
            state_root: storage.calculate_state_root(),
            tx_merkle_root: "0".into(),
        },
        transactions: vec![tx.clone()],
    };
    
    // Execute block contents
    for tx in &block.transactions {
        if vm.verify_compliance(tx) {
            let res = vm.execute_transaction(&tx.sender, &tx.receiver, tx.encode(), tx.amount);
            println!("VM execution result: {:?}", res);
            assert!(res.is_ok());
            storage.increment_nonce(&tx.sender);
        }
    }
    storage.save_block(&block);

    // 7. Verify Final State
    assert_eq!(storage.get_balance(&investor_addr), 1_000_000_000);
    assert_eq!(storage.get_nonce(&institution_addr), 1);
    
    let latest_height = storage.get_latest_height();
    assert_eq!(latest_height, 1);
    
    println!("INSTITUTIONAL E2E TEST PASSED!");
}
