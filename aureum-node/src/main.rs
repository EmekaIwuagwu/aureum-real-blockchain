use aureum_node::core::{Transaction, Block, Validator, ValidatorRole, ValidatorSet, ChainState, BlockHeader, TransactionType, Property, VisaApplication, ApplicationStatus, VisaProgram, Escrow, EscrowStatus};
use aureum_node::storage::ChainStorage;
use aureum_node::consensus::{ConsensusEngine, BftStep};
use aureum_node::vm::AureumVM;
use aureum_node::compliance::{ComplianceEngine};
use aureum_node::oracle::{AureumOracle};
use aureum_node::network::{P2PNetwork, TOPIC_TRANSACTIONS, TOPIC_BLOCKS, TOPIC_CONSENSUS};
use clap::{Parser, Subcommand};
use log::{info, warn, error};
use std::sync::Arc;
use tokio::sync::{Mutex, mpsc};
use jsonrpc_http_server::jsonrpc_core::{IoHandler, Value, Params};
use jsonrpc_http_server::ServerBuilder;
use parity_scale_codec::{Encode, Decode};
use futures::StreamExt;
use libp2p::gossipsub;

#[derive(Parser)]
#[command(name = "aureum-node")]
#[command(about = "Aureum Layer 1 Blockchain Node", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    Run {
        #[arg(short, long, default_value = "8545")]
        rpc_port: u16,
        #[arg(short, long, default_value = "./data")]
        data_dir: String,
        #[arg(short, long)]
        validator: bool,
    },
    Init {
        #[arg(short, long, default_value = "./data")]
        data_dir: String,
    },
}

#[tokio::main]
async fn main() {
    env_logger::init();
    let cli = Cli::parse();

    match cli.command {
        Commands::Init { data_dir } => {
            init_node(&data_dir);
        }
        Commands::Run { rpc_port, data_dir, validator: _ } => {
            run_node(&data_dir, rpc_port).await;
        }
    }
}

fn init_node(data_dir: &str) {
    info!("Initializing Aureum node at {}...", data_dir);
    let storage = ChainStorage::new(&format!("{}/blockchain", data_dir));
    
    let initial_validator_address = "A1109cd8305ff4145b0b89495431540d1f4faecdc".to_string();
    
    // Always create genesis if it doesn't exist
    if storage.get_block(0).is_none() {
        let genesis = Block::new_genesis();
        storage.save_block(&genesis);
        info!("Genesis block created.");
    }
    
    // Always set up validator if balance is 0 (fresh init or reset)
    if storage.get_balance(&initial_validator_address) == 0 {
        let mut pub_key = [0u8; 32];
        hex::decode_to_slice("3b6a27bcceb6a42d62a3a8d02a6f0d73653215771de243a63ac048a18b59da29", &mut pub_key).expect("Invalid hex");
        
        let initial_validator = Validator {
            address: initial_validator_address.clone(),
            public_key: pub_key.to_vec(),
            stake: 1_000_000,
            role: ValidatorRole::Authority,
            last_active: 0,
        };
        let set = ValidatorSet {
            validators: vec![initial_validator.clone()],
            total_stake: 1_000_000,
        };
        storage.save_validator_set(&set);
        info!("Updating validator balance to 1B AUR...");
        storage.update_balance(&initial_validator.address, 1_000_000_000); // 1B AUR
        storage.save_chain_state(&ChainState { total_supply: 21_000_000_000, burned_fees: 0 });
        storage.flush(); // Ensure all data is written to disk
        info!("Verification: Validator balance is now {}", storage.get_balance(&initial_validator.address));
        info!("Initial validator funded with 1B AUR.");
    } else {
        info!("Validator already has balance: {} AUR", storage.get_balance(&initial_validator_address));
    }
    
    info!("� Node initialization complete.");
}

async fn run_node(data_dir: &str, rpc_port: u16) {
    info!("🚀 Aureum Node starting...");
    let storage = Arc::new(ChainStorage::new(&format!("{}/blockchain", data_dir)));
    let (_tx_sender, mut _tx_receiver) = mpsc::channel::<Vec<u8>>(1000);
    
    // Core Engines
    let validator_set = storage.get_validator_set().expect("Validator set missing. Run init first.");
    let compliance = Arc::new(ComplianceEngine::new(storage.clone()));
    let vm = Arc::new(AureumVM::new(storage.clone(), compliance.clone()));
    let engine = Arc::new(Mutex::new(ConsensusEngine::new(validator_set)));
    let mempool = Arc::new(Mutex::new(Vec::<Transaction>::new()));
    let _oracle = Arc::new(Mutex::new(AureumOracle::new(storage.clone(), vec![])));

    // Network Setup
    let mut network = P2PNetwork::new().await.expect("Failed to start networking");
    network.subscribe(TOPIC_TRANSACTIONS);
    network.subscribe(TOPIC_BLOCKS);
    network.subscribe(TOPIC_CONSENSUS);

    // Node Event Loop
    let engine_loop = engine.clone();
    let mempool_loop = mempool.clone();
    let storage_loop = storage.clone();
    let vm_loop = vm.clone();
    
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(5));
        loop {
            tokio::select! {
                // Handle P2P Network Events
                event = network.swarm.next() => {
                    if let Some(event) = event {
                        match event {
                            libp2p::swarm::SwarmEvent::Behaviour(aureum_node::network::AureumBehaviourEvent::Gossipsub(gossipsub::Event::Message {
                                message, ..
                            })) => {
                                let topic = message.topic.as_str();
                                if topic == TOPIC_TRANSACTIONS {
                                    if let Ok(tx) = Transaction::decode(&mut &message.data[..]) {
                                        let mut mempool = mempool_loop.lock().await;
                                        if !mempool.iter().any(|existing| existing.hash() == tx.hash()) {
                                            if vm_loop.verify_compliance(&tx) {
                                                mempool.push(tx);
                                            }
                                        }
                                    }
                                } else if topic == TOPIC_BLOCKS {
                                    if let Ok(block) = Block::decode(&mut &message.data[..]) {
                                        // Simple block acceptance (Real: verify consensus)
                                        storage_loop.save_block(&block);
                                    }
                                }
                            }
                            _ => {}
                        }
                    }
                }
                
                // Handle Consensus Ticks
                _ = interval.tick() => {
                    let mut engine = engine_loop.lock().await;

                    match engine.step {
                        BftStep::Propose => {
                            let proposer = engine.select_proposer();
                            info!("Consensus: Proposer {} for height {}", proposer, engine.height);
                            
                            let mut txs = mempool_loop.lock().await;
                            if !txs.is_empty() {
                                let mut compliant_txs = Vec::new();
                                for tx in txs.drain(..) {
                                    if vm_loop.verify_compliance(&tx) {
                                        compliant_txs.push(tx);
                                    }
                                }

                                if !compliant_txs.is_empty() {
                                    let mut block = Block {
                                        header: BlockHeader {
                                            parent_hash: storage_loop.get_block(engine.height - 1).map(|b| b.hash()).unwrap_or_default(),
                                            timestamp: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs(),
                                            height: engine.height,
                                            state_root: storage_loop.calculate_state_root(),
                                            tx_merkle_root: "".into(),
                                        },
                                        transactions: compliant_txs,
                                    };
                                    block.header.tx_merkle_root = block.calculate_merkle_root();
                                    
                                    // Broadcast block
                                    network.broadcast(TOPIC_BLOCKS, block.encode());
                                    engine.set_proposal(block);
                                }
                            }
                            engine.next_step(&storage_loop, None);
                        }
                        BftStep::Prevote | BftStep::Precommit => {
                            engine.next_step(&storage_loop, None);
                        }
                        BftStep::Commit => {
                            if let Some(block) = engine.proposal.clone() {
                                info!("🔗 Committing block {} with {} transactions", block.header.height, block.transactions.len());
                                
                                for tx in &block.transactions {
                                    if !vm_loop.verify_compliance(tx) {
                                        warn!("⚠️  Tx Failed Compliance: {} -> {}", tx.sender, tx.receiver);
                                        continue;
                                    }

                                    match &tx.tx_type {
                                        TransactionType::Transfer => {
                                            // Simple AUR transfer - direct balance update (no EVM needed)
                                            let sender_balance = storage_loop.get_balance(&tx.sender);
                                            let total_cost = tx.amount + tx.fee;
                                            
                                            if sender_balance >= total_cost {
                                                storage_loop.update_balance(&tx.sender, sender_balance - total_cost);
                                                let receiver_balance = storage_loop.get_balance(&tx.receiver);
                                                storage_loop.update_balance(&tx.receiver, receiver_balance + tx.amount);
                                                storage_loop.increment_nonce(&tx.sender);
                                                info!("✅ Transfer: {} -> {} ({} AUR, fee: {})", tx.sender, tx.receiver, tx.amount, tx.fee);
                                            } else {
                                                error!("❌ Insufficient balance: {} has {} but needs {}", tx.sender, sender_balance, total_cost);
                                            }
                                        }
                                        
                                        TransactionType::ContractCall { data, target } => {
                                            // EVM contract call
                                            match vm_loop.execute_transaction(&tx.sender, target, data.clone(), tx.amount) {
                                                Ok(_) => {
                                                    info!("✅ Contract Call: {} -> {} ({} AUR)", tx.sender, target, tx.amount);
                                                    storage_loop.increment_nonce(&tx.sender);
                                                }
                                                Err(e) => error!("❌ Contract Call Failed: {}", e),
                                            }
                                        }
                                        
                                        TransactionType::ContractCreate { bytecode } => {
                                            // EVM contract deployment
                                            match vm_loop.execute_transaction(&tx.sender, "0", bytecode.clone(), tx.amount) {
                                                Ok(_) => {
                                                    info!("✅ Contract Deployed by {}", tx.sender);
                                                    storage_loop.increment_nonce(&tx.sender);
                                                }
                                                Err(e) => error!("❌ Contract Deploy Failed: {}", e),
                                            }
                                        }
                                        
                                        TransactionType::TokenizeProperty { address, metadata } => {
                                            let prop = Property {
                                                id: tx.hash(),
                                                owner: tx.sender.clone(),
                                                co_owners: vec![],
                                                jurisdiction: "Portugal".to_string(), // Default for testnet
                                                legal_description: address.clone(),
                                                coordinates: (38.7223, -9.1393), // Lisbon coordinates
                                                valuation_eur: tx.amount,
                                                valuation_timestamp: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs(),
                                                valuation_oracle: "AureumCoreOracle".to_string(),
                                                title_deed_hash: hex::encode(metadata.as_bytes()),
                                                survey_hash: "".to_string(),
                                                visa_program_eligible: tx.amount >= 500_000,
                                                minimum_investment_met: true,
                                                kyc_status: 1,
                                                aml_cleared: true,
                                                mortgages: vec![],
                                                liens: vec![],
                                            };
                                            storage_loop.save_property(&prop);
                                            storage_loop.increment_nonce(&tx.sender);
                                            info!("🏠 Property Tokenized: {} (Valuation: {} AUR)", prop.id, prop.valuation_eur);
                                        }

                                        TransactionType::ApplyForVisa { property_id, program } => {
                                            let app = VisaApplication {
                                                applicant: tx.sender.clone(),
                                                property_id: property_id.clone(),
                                                investment_amount: tx.amount,
                                                program: program.clone(),
                                                status: ApplicationStatus::Pending,
                                                timestamp: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs(),
                                            };
                                            storage_loop.save_visa_application(&app);
                                            storage_loop.increment_nonce(&tx.sender);
                                            info!("🛂 Visa Application Submitted: {} for {:?}", app.applicant, app.program);
                                        }

                                        TransactionType::EscrowCreate { arbiter, conditions } => {
                                            let sender_balance = storage_loop.get_balance(&tx.sender);
                                            let total_cost = tx.amount + tx.fee;
                                            
                                            if sender_balance >= total_cost {
                                                // 1. Deduct funds
                                                storage_loop.update_balance(&tx.sender, sender_balance - total_cost);
                                                storage_loop.increment_nonce(&tx.sender);

                                                // 2. Create Escrow Record
                                                let escrow = Escrow {
                                                    id: tx.hash(),
                                                    sender: tx.sender.clone(),
                                                    receiver: tx.receiver.clone(),
                                                    arbiter: arbiter.clone(),
                                                    amount: tx.amount,
                                                    conditions: conditions.clone(),
                                                    status: EscrowStatus::Pending,
                                                    created_at: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs(),
                                                };
                                                storage_loop.save_escrow(&escrow);
                                                info!("🔒 Escrow Created: {} ({} AUR locked)", escrow.id, escrow.amount);
                                            } else {
                                                error!("❌ Escrow Create Failed: Insufficient Fund {}", tx.sender);
                                            }
                                        }

                                        TransactionType::EscrowRelease { escrow_id } => {
                                            if let Some(mut escrow) = storage_loop.get_escrow(escrow_id) {
                                                if escrow.status == EscrowStatus::Pending {
                                                    // Only Arbiter or Sender can release
                                                    if tx.sender == escrow.arbiter || tx.sender == escrow.sender {
                                                        // Update Escrow State
                                                        escrow.status = EscrowStatus::Released;
                                                        storage_loop.save_escrow(&escrow);
                                                        
                                                        // Transfer Funds to Receiver
                                                        let receiver_balance = storage_loop.get_balance(&escrow.receiver);
                                                        storage_loop.update_balance(&escrow.receiver, receiver_balance + escrow.amount);
                                                        
                                                        // Pay Fee
                                                        let sender_balance = storage_loop.get_balance(&tx.sender);
                                                        if sender_balance >= tx.fee {
                                                             storage_loop.update_balance(&tx.sender, sender_balance - tx.fee);
                                                        }

                                                        storage_loop.increment_nonce(&tx.sender);
                                                        info!("🔓 Escrow Released: {} -> {} ({} AUR)", escrow_id, escrow.receiver, escrow.amount);
                                                    } else {
                                                        error!("❌ Escrow Release Failed: Unauthorized {}", tx.sender);
                                                    }
                                                } else {
                                                     error!("❌ Escrow Release Failed: Status is {:?}", escrow.status);
                                                }
                                            }
                                        }

                                        TransactionType::EscrowRefund { escrow_id } => {
                                            if let Some(mut escrow) = storage_loop.get_escrow(escrow_id) {
                                                if escrow.status == EscrowStatus::Pending {
                                                    // Only Arbiter can refund (or maybe receiver if they decline?) - Let's stick to Arbiter
                                                    if tx.sender == escrow.arbiter {
                                                        // Update Escrow State
                                                        escrow.status = EscrowStatus::Refunded;
                                                        storage_loop.save_escrow(&escrow);
                                                        
                                                        // Refund Funds to Sender
                                                        let sender_balance = storage_loop.get_balance(&escrow.sender);
                                                        storage_loop.update_balance(&escrow.sender, sender_balance + escrow.amount);
                                                        
                                                        // Pay Fee
                                                        let arbiter_balance = storage_loop.get_balance(&tx.sender);
                                                        if arbiter_balance >= tx.fee {
                                                             storage_loop.update_balance(&tx.sender, arbiter_balance - tx.fee);
                                                        }

                                                        storage_loop.increment_nonce(&tx.sender);
                                                        info!("↩️ Escrow Refunded: {} -> {} ({} AUR)", escrow_id, escrow.sender, escrow.amount);
                                                    } else {
                                                        error!("❌ Escrow Refund Failed: Unauthorized {}", tx.sender);
                                                    }
                                                }
                                            }
                                        }
                                        
                                        _ => {
                                            // Other transaction types (Stake, etc.)
                                        }
                                    }
                                }
                                
                                storage_loop.save_block(&block);
                                storage_loop.flush();
                                info!("💾 Block {} finalized with {} txs", block.header.height, block.transactions.len());
                                engine.next_step(&storage_loop, Some(&block));
                            } else {
                                engine.next_step(&storage_loop, None);
                            }
                        }
                    }
                }
            }
        }
    });

    // RPC Server
    let mut io = IoHandler::default();
    
    let s_clone = storage.clone();
    io.add_method("aureum_getBalance", move |params: Params| {
        let s = s_clone.clone();
        async move {
            let addrs: Vec<String> = params.parse().map_err(|_| jsonrpc_http_server::jsonrpc_core::Error::invalid_params("Expected [address]"))?;
            if addrs.is_empty() {
                return Err(jsonrpc_http_server::jsonrpc_core::Error::invalid_params("Address missing"));
            }
            Ok(Value::String(s.get_balance(&addrs[0]).to_string()))
        }
    });

    let s_clone = storage.clone();
    io.add_method("eth_getBalance", move |params: Params| {
        let s = s_clone.clone();
        async move {
            let addrs: Vec<String> = params.parse().map_err(|_| jsonrpc_http_server::jsonrpc_core::Error::invalid_params("Expected [address]"))?;
            if addrs.is_empty() {
                return Err(jsonrpc_http_server::jsonrpc_core::Error::invalid_params("Address missing"));
            }
            Ok(Value::String(s.get_balance(&addrs[0]).to_string()))
        }
    });

    let s_clone = storage.clone();
    io.add_method("aureum_getNonce", move |params: Params| {
        let s = s_clone.clone();
        async move {
            let addrs: Vec<String> = params.parse().map_err(|_| jsonrpc_http_server::jsonrpc_core::Error::invalid_params("Expected [address]"))?;
            if addrs.is_empty() {
                return Err(jsonrpc_http_server::jsonrpc_core::Error::invalid_params("Address missing"));
            }
            Ok(Value::String(s.get_nonce(&addrs[0]).to_string()))
        }
    });

    let s_clone = storage.clone();
    io.add_method("aureum_getChainState", move |params: Params| {
        let s = s_clone.clone();
        async move {
            let state = s.get_chain_state().unwrap_or(ChainState { total_supply: 0, burned_fees: 0 });
            Ok(serde_json::to_value(state).unwrap())
        }
    });

    let s_clone = storage.clone();
    io.add_method("aureum_getLatestBlock", move |_| {
        let s = s_clone.clone();
        async move {
            let height = s.get_latest_height();
            let block = s.get_block(height);
            Ok(serde_json::to_value(block).unwrap_or(Value::Null))
        }
    });

    let s_clone = storage.clone();
    io.add_method("aureum_getBlockByNumber", move |params: Params| {
        let s = s_clone.clone();
        async move {
            let height: Vec<u64> = params.parse().map_err(|_| jsonrpc_http_server::jsonrpc_core::Error::invalid_params("Expected [height]"))?;
            if height.is_empty() {
                return Err(jsonrpc_http_server::jsonrpc_core::Error::invalid_params("Height missing"));
            }
            let block = s.get_block(height[0]);
            Ok(serde_json::to_value(block).unwrap_or(Value::Null))
        }
    });

    let vm_clone = vm.clone();
    io.add_method("aureum_estimateGas", move |params: Params| {
        let _vm = vm_clone.clone();
        async move {
            // Simplified gas estimation based on data length
            let tx_hex: String = params.parse().unwrap();
            let bytes = hex::decode(tx_hex.replace("0x", "")).unwrap_or_default();
            let gas = 21000 + (bytes.len() as u64 * 16);
            Ok(Value::String(gas.to_string()))
        }
    });

    let m_clone = mempool.clone();
    let v_clone = vm.clone();
    io.add_method("aureum_submitTransaction", move |params: Params| {
        let m = m_clone.clone();
        let v = v_clone.clone();
        async move {
            let txs: Vec<Transaction> = params.parse().map_err(|_| jsonrpc_http_server::jsonrpc_core::Error::invalid_params("Invalid Transaction JSON array"))?;
            if txs.is_empty() {
                 return Err(jsonrpc_http_server::jsonrpc_core::Error::invalid_params("Transaction missing"));
            }
            let tx = &txs[0];
            
            if !tx.verify_signature() {
                return Ok(Value::String("Invalid Signature".into()));
            }

            if !v.verify_compliance(&tx) {
                return Ok(Value::String("Compliance Check Failed".into()));
            }

            let hash = tx.hash();
            let mut tx_with_hash = tx.clone();
            tx_with_hash.hash = Some(hash.clone());
            m.lock().await.push(tx_with_hash);
            Ok(Value::String(hash))
        }
    });

    let m_clone = mempool.clone();
    let vm_clone = vm.clone();
    io.add_method("aureum_sendTransaction", move |params: Params| {
        let m = m_clone.clone();
        let v = vm_clone.clone();
        async move {
            let tx_hex: String = params.parse().unwrap();
            let bytes = hex::decode(tx_hex.replace("0x", "")).map_err(|_| jsonrpc_http_server::jsonrpc_core::Error::invalid_params("Invalid hex"))?;
            let tx = Transaction::decode(&mut &bytes[..]).map_err(|_| jsonrpc_http_server::jsonrpc_core::Error::invalid_params("Decode Failed"))?;
            
            if !tx.verify_signature() {
                return Ok(Value::String("Invalid Signature".into()));
            }

            if !v.verify_compliance(&tx) {
                return Ok(Value::String("Compliance Check Failed".into()));
            }

            let hash = tx.hash();
            m.lock().await.push(tx);
            Ok(Value::String(format!("0x{}", hash)))
        }
    });

    let s_clone = storage.clone();
    io.add_method("aureum_getProperty", move |params: Params| {
        let s = s_clone.clone();
        async move {
            let id: String = params.parse().unwrap();
            let prop = s.get_property(&id);
            Ok(serde_json::to_value(prop).unwrap())
        }
    });

    let s_clone = storage.clone();
    io.add_method("aureum_getValidators", move |_| {
        let s = s_clone.clone();
        async move {
            let set = s.get_validator_set();
            Ok(serde_json::to_value(set).unwrap_or(Value::Null))
        }
    });

    let s_clone = storage.clone();
    io.add_method("aureum_getVisaStatus", move |params: Params| {
        let s = s_clone.clone();
        async move {
             let params: Vec<String> = params.parse().unwrap_or_default();
             if params.is_empty() { return Ok(Value::Null); }
             let app = s.get_visa_application(&params[0]);
             Ok(serde_json::to_value(app).unwrap_or(Value::Null))
        }
    });

    let s_clone = storage.clone();
    io.add_method("aureum_getEscrow", move |params: Params| {
        let s = s_clone.clone();
        async move {
            let params: Vec<String> = params.parse().unwrap_or_default();
            if params.is_empty() { return Ok(Value::Null); }
            let escrow = s.get_escrow(&params[0]);
            Ok(serde_json::to_value(escrow).unwrap_or(Value::Null))
        }
    });

    let server = ServerBuilder::new(io)
        .start_http(&format!("0.0.0.0:{}", rpc_port).parse().unwrap())
        .expect("RPC start failed");

    info!("🌐 RPC Server active on port {}", rpc_port);
    server.wait();
}
