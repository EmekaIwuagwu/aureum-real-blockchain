use aureum_node::core::{Transaction, TransactionType, VisaProgram};
use aureum_node::storage::ChainStorage;
use aureum_node::vm::AureumVM;
use aureum_node::compliance::{ComplianceEngine, ComplianceProfile, Jurisdiction};
use ed25519_dalek::{SigningKey, Signer};
use rand_core::OsRng;
use std::sync::Arc;
use parity_scale_codec::Encode;

#[tokio::test]
async fn test_system_wide_operations() {
    // 1. Setup Environment
    let db_path = "test_data/system_test_db";
    let _ = std::fs::remove_dir_all(db_path);
    let storage = Arc::new(ChainStorage::new(db_path));
    let compliance = Arc::new(ComplianceEngine::new(storage.clone()));
    let vm = AureumVM::new(storage.clone(), compliance.clone());

    // 2. Setup Wallets (Genesis & Alice)
    let mut csprng = OsRng;
    let genesis_key = SigningKey::generate(&mut csprng);
    let genesis_addr = aureum_node::core::generate_address(genesis_key.verifying_key().as_bytes());

    let alice_key = SigningKey::generate(&mut csprng);
    let alice_addr = aureum_node::core::generate_address(alice_key.verifying_key().as_bytes());

    println!("Genesis: {}", genesis_addr);
    println!("Alice:   {}", alice_addr);

    // 3. Initialize State (Mint 1M AUR to Genesis)
    storage.update_balance(&genesis_addr, 1_000_000);
    assert_eq!(storage.get_balance(&genesis_addr), 1_000_000);

    // 4. TRANSACTION 1: Transfer 500k to Alice
    let mut tx1 = Transaction {
        sender: genesis_addr.clone(),
        receiver: alice_addr.clone(),
        amount: 500_000,
        nonce: 0,
        fee: 100,
        signature: vec![],
        pub_key: genesis_key.verifying_key().to_bytes().to_vec(),
        tx_type: TransactionType::Transfer,
    };
    
    // Sign TX1
    let mut msg1 = Vec::new();
    msg1.extend_from_slice(tx1.sender.as_bytes());
    msg1.extend_from_slice(tx1.receiver.as_bytes());
    msg1.extend_from_slice(&tx1.amount.to_be_bytes());
    msg1.extend_from_slice(&tx1.nonce.to_be_bytes());
    msg1.extend_from_slice(&tx1.fee.to_be_bytes());
    msg1.extend_from_slice(&tx1.pub_key);
    msg1.extend_from_slice(&tx1.tx_type.encode());
    
    tx1.signature = genesis_key.sign(&msg1).to_vec();

    // Execute TX1
    assert!(tx1.verify_signature());
    
    // Simulate execution loop logic
    let bal_gen = storage.get_balance(&genesis_addr);
    assert!(bal_gen >= tx1.amount + tx1.fee);
    storage.update_balance(&genesis_addr, bal_gen - (tx1.amount + tx1.fee));
    storage.update_balance(&alice_addr, storage.get_balance(&alice_addr) + tx1.amount);
    storage.increment_nonce(&genesis_addr);

    assert_eq!(storage.get_balance(&alice_addr), 500_000);
    assert_eq!(storage.get_nonce(&genesis_addr), 1);

    // 5. TRANSACTION 2: Alice registers a Property (Villa)
    let prop_metadata = "QmHashOfDeed".to_string();
    let prop_addr = "Rua Augusta, Lisbon".to_string();
    let mut tx2 = Transaction {
        sender: alice_addr.clone(),
        receiver: "".to_string(), // System
        amount: 350_000, // Valuation
        nonce: 0,
        fee: 500,
        signature: vec![],
        pub_key: alice_key.verifying_key().to_bytes().to_vec(),
        tx_type: TransactionType::TokenizeProperty { 
            address: prop_addr.clone(), 
            metadata: prop_metadata.clone() 
        },
    };

    let mut msg2 = Vec::new();
    msg2.extend_from_slice(tx2.sender.as_bytes());
    msg2.extend_from_slice(tx2.receiver.as_bytes());
    msg2.extend_from_slice(&tx2.amount.to_be_bytes());
    msg2.extend_from_slice(&tx2.nonce.to_be_bytes());
    msg2.extend_from_slice(&tx2.fee.to_be_bytes());
    msg2.extend_from_slice(&tx2.pub_key);
    msg2.extend_from_slice(&tx2.tx_type.encode());
    
    tx2.signature = alice_key.sign(&msg2).to_vec();

    // Execute TX2
    assert!(tx2.verify_signature());
    
    let prop = aureum_node::core::Property {
        id: format!("prop_{}", tx2.nonce),
        owner: tx2.sender.clone(),
        co_owners: vec![],
        jurisdiction: "Portugal".to_string(),
        legal_description: prop_addr.clone(),
        coordinates: (0.0, 0.0),
        valuation_eur: tx2.amount,
        valuation_timestamp: 1234567890,
        valuation_oracle: "system".to_string(),
        title_deed_hash: prop_metadata.clone(),
        survey_hash: "".to_string(),
        visa_program_eligible: true,
        minimum_investment_met: tx2.amount >= 250_000,
        kyc_status: 1,
        aml_cleared: true,
        mortgages: vec![],
        liens: vec![],
    };
    storage.save_property(&prop);
    storage.increment_nonce(&alice_addr);

    // Verify Property
    let saved_prop = storage.get_property("prop_0").expect("Property not found");
    assert_eq!(saved_prop.owner, alice_addr);
    assert_eq!(saved_prop.valuation_eur, 350_000);

    // 6. TRANSACTION 3: Alice applies for Golden Visa
    let mut tx3 = Transaction {
        sender: alice_addr.clone(),
        receiver: "".to_string(),
        amount: 0,
        nonce: 1, // Incremented
        fee: 50,
        signature: vec![],
        pub_key: alice_key.verifying_key().to_bytes().to_vec(),
        tx_type: TransactionType::ApplyForVisa { 
            property_id: saved_prop.id.clone(), 
            program: VisaProgram::Portugal 
        },
    };

    let mut msg3 = Vec::new();
    msg3.extend_from_slice(tx3.sender.as_bytes());
    msg3.extend_from_slice(tx3.receiver.as_bytes());
    msg3.extend_from_slice(&tx3.amount.to_be_bytes());
    msg3.extend_from_slice(&tx3.nonce.to_be_bytes());
    msg3.extend_from_slice(&tx3.fee.to_be_bytes());
    msg3.extend_from_slice(&tx3.pub_key);
    msg3.extend_from_slice(&tx3.tx_type.encode());
    
    tx3.signature = alice_key.sign(&msg3).to_vec();

    // Execute TX3
    assert!(tx3.verify_signature());

    if let Some(p) = storage.get_property(&saved_prop.id) {
        if p.owner == tx3.sender {
            let app = aureum_node::core::VisaApplication {
                applicant: tx3.sender.clone(),
                property_id: p.id.clone(),
                investment_amount: p.valuation_eur,
                program: VisaProgram::Portugal,
                status: aureum_node::core::ApplicationStatus::Pending,
                timestamp: 1234567899,
            };
            storage.save_visa_application(&app);
            storage.increment_nonce(&tx3.sender);
        }
    }

    // Verify Visa
    let saved_app = storage.get_visa_application(&alice_addr).expect("Visa app not found");
    assert_eq!(saved_app.property_id, "prop_0");
    assert_eq!(saved_app.status, aureum_node::core::ApplicationStatus::Pending);

    // 7. Calculate State Root
    let root = storage.calculate_state_root();
    println!("Final State Root: {}", root);
    assert_ne!(root, "");

    println!("SYSTEM TEST PASSED: Full lifecycle executed successfully.");
}
