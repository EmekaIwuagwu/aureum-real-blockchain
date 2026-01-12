mod core;
mod storage;
mod consensus;
mod network;
mod vm;
mod compliance;
mod oracle;


use log::{info, warn, error};
use jsonrpc_http_server::jsonrpc_core::{IoHandler, Value, Params};
use jsonrpc_http_server::ServerBuilder;
use std::sync::Arc;
use tokio::sync::{Mutex, mpsc};
use crate::storage::ChainStorage;
use crate::consensus::ConsensusEngine;
use crate::vm::AureumVM;
use crate::compliance::{ComplianceEngine, ComplianceProfile, Jurisdiction};
use crate::oracle::{AureumOracle, OracleReport};
use crate::network::{P2PNetwork, TOPIC_TRANSACTIONS, TOPIC_BLOCKS};
use crate::core::{Block, Validator, ValidatorRole, ValidatorSet};
use futures::StreamExt;
use libp2p::swarm::SwarmEvent;

#[tokio::main]
async fn main() {
    env_logger::init();
    info!("Aureum Chain Node starting...");

    let storage = Arc::new(ChainStorage::new("./data/blockchain"));
    
    // P2P Network Setup
    let mut network = P2PNetwork::new().await.expect("Failed to initialize P2P");
    network.subscribe(TOPIC_TRANSACTIONS);
    network.subscribe(TOPIC_BLOCKS);
    
    let (tx_sender, mut tx_receiver) = mpsc::channel::<Vec<u8>>(100);
    let peer_count = Arc::new(Mutex::new(0usize));
    let peer_count_clone = peer_count.clone();

    // Swarm Event Loop Task
    tokio::spawn(async move {
        let mut swarm = network.swarm;
        loop {
            tokio::select! {
                Some(event) = swarm.next() => match event {
                    SwarmEvent::Behaviour(network::AureumBehaviourEvent::Mdns(event)) => {
                        if let libp2p::mdns::Event::Discovered(list) = event {
                            for (peer_id, addr) in list {
                                info!("Mdns discovered peer: {} at {}", peer_id, addr);
                                swarm.behaviour_mut().kademlia.add_address(&peer_id, addr);
                            }
                        }
                    },
                    SwarmEvent::ConnectionEstablished { peer_id, .. } => {
                        info!("Connection established with {}", peer_id);
                        let mut count = peer_count_clone.lock().await;
                        *count += 1;
                    },
                    SwarmEvent::ConnectionClosed { peer_id, .. } => {
                        info!("Connection closed with {}", peer_id);
                        let mut count = peer_count_clone.lock().await;
                        if *count > 0 { *count -= 1; }
                    },
                    _ => {}
                },
                Some(msg) = tx_receiver.recv() => {
                    let topic = libp2p::gossipsub::IdentTopic::new(TOPIC_TRANSACTIONS);
                    if let Err(e) = swarm.behaviour_mut().gossipsub.publish(topic, msg) {
                        error!("Broadcasting error: {:?}", e);
                    }
                }
            }
        }
    });

    // Initialize Genesis if needed
    if storage.get_block(0).is_none() {
        info!("Initializing Genesis Block...");
        let genesis = Block::new_genesis();
        storage.save_block(&genesis);
        
        let initial_validator = Validator {
            address: "aur1initial_validator_address".to_string(),
            public_key: vec![0u8; 32],
            stake: 1_000_000,
            role: ValidatorRole::Authority,
            last_active: 0,
        };
        let set = ValidatorSet {
            validators: vec![initial_validator],
            total_stake: 1_000_000,
        };
        storage.save_validator_set(&set);
        storage.update_balance("aur1initial_validator_address", 1_000_000);

        // Initialize Global State
        let initial_state = crate::core::ChainState {
            total_supply: 21_000_000_000, // 21B AUR Max Supply
            burned_fees: 0,
        };
        storage.save_chain_state(&initial_state);
    }

    let val_set = storage.get_validator_set().expect("Fatal: No validator set found");
    let engine = Arc::new(Mutex::new(ConsensusEngine::new(val_set)));
    let vm = Arc::new(AureumVM::new(storage.clone()));
    let mempool = Arc::new(Mutex::new(Vec::<crate::core::Transaction>::new()));

    // Specialized Institutional Engines
    let compliance_engine = Arc::new(Mutex::new(ComplianceEngine::new()));
    let oracle = Arc::new(Mutex::new(AureumOracle::new(vec!["aur1initial_validator_address".to_string()])));

    // Automated Consensus Loop (Priority 1-3 Automation)
    let engine_loop = engine.clone();
    let storage_loop = storage.clone();
    let mempool_loop = mempool.clone();
    let vm_loop = vm.clone();
    
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(3)).await; // 3s per step
            let mut engine = engine_loop.lock().await;
            
            match engine.step {
                crate::consensus::BftStep::Propose => {
                    let proposer = engine.select_proposer();
                    info!("Consensus [Height {}]: Proposer {} proposing block...", engine.height, proposer);
                    engine.next_step(&storage_loop, None);
                },
                crate::consensus::BftStep::Prevote => {
                    info!("Consensus [Height {}]: Aggregating Pre-votes...", engine.height);
                    engine.next_step(&storage_loop, None);
                },
                crate::consensus::BftStep::Precommit => {
                    info!("Consensus [Height {}]: Finalizing Pre-commits...", engine.height);
                    engine.next_step(&storage_loop, None);
                },
                crate::consensus::BftStep::Commit => {
                    info!("Consensus [Height {}]: COMMITTING to state...", engine.height);
                    
                    // 1. Process Mempool
                    let mut txs_lock = mempool_loop.lock().await;
                    let current_txs = txs_lock.drain(..).collect::<Vec<_>>();
                    
                    // 2. Execute Transactions in AVM
                    for tx in &current_txs {
                        // Anti-Replay Protection (Section 1.2.C)
                        let current_nonce = storage_loop.get_nonce(&tx.sender);
                        if tx.nonce != current_nonce {
                            warn!("Skipping transaction from {}: Invalid nonce (Expected {}, Got {})", tx.sender, current_nonce, tx.nonce);
                            continue;
                        }

                        match tx.tx_type {
                            crate::core::TransactionType::Transfer => {
                                let balance_from = storage_loop.get_balance(&tx.sender);
                                if balance_from >= tx.amount + tx.fee {
                                    storage_loop.update_balance(&tx.sender, balance_from - (tx.amount + tx.fee));
                                    let balance_to = storage_loop.get_balance(&tx.receiver);
                                    storage_loop.update_balance(&tx.receiver, balance_to + tx.amount);
                                    storage_loop.increment_nonce(&tx.sender);
                                }
                            },
                            crate::core::TransactionType::TokenizeProperty { ref address, ref metadata } => {
                                // Phase 2 MVP: Create persistent property record
                                let prop = crate::core::Property {
                                    id: format!("prop_{}", tx.nonce),
                                    owner: tx.sender.clone(),
                                    co_owners: vec![],
                                    jurisdiction: "Portugal".to_string(), // Default for Phase 1
                                    legal_description: address.clone(),
                                    coordinates: (0.0, 0.0),
                                    valuation_eur: tx.amount,
                                    valuation_timestamp: block.header.timestamp,
                                    valuation_oracle: "system".to_string(),
                                    title_deed_hash: metadata.clone(),
                                    survey_hash: "".to_string(),
                                    visa_program_eligible: true,
                                    minimum_investment_met: tx.amount >= 500_000, // 500k threshold
                                    kyc_status: 1,
                                    aml_cleared: true,
                                    mortgages: vec![],
                                    liens: vec![],
                                };
                                storage_loop.save_property(&prop);
                                storage_loop.increment_nonce(&tx.sender);
                                info!("PROPERTY REGISTERED: {} (Owner: {})", prop.id, prop.owner);
                            },
                            crate::core::TransactionType::ApplyForVisa { ref property_id, ref program } => {
                                // Phase 2: Link property ownership to visa application
                                if let Some(prop) = storage_loop.get_property(property_id) {
                                    if prop.owner == tx.sender {
                                        let app = crate::core::VisaApplication {
                                            applicant: tx.sender.clone(),
                                            property_id: property_id.clone(),
                                            investment_amount: prop.valuation_eur,
                                            program: program.clone(),
                                            status: crate::core::ApplicationStatus::Pending,
                                            timestamp: block.header.timestamp,
                                        };
                                        storage_loop.save_visa_application(&app);
                                        storage_loop.increment_nonce(&tx.sender);
                                        info!("VISA APPLICATION SUBMITTED: Applicant {} for Property {}", app.applicant, app.property_id);
                                    }
                                }
                            },
                            crate::core::TransactionType::ContractCreate { ref bytecode } => {
                                // Institutional execution of Solidity/Quorlin Bytecode
                                match vm_loop.execute_transaction(&tx.sender, "0x0000000000000000000000000000000000000000", bytecode.clone(), tx.amount) {
                                    Ok(_) => {
                                        storage_loop.increment_nonce(&tx.sender);
                                        info!("CONTRACT DEPLOYED by {}", tx.sender);
                                    },
                                    Err(e) => warn!("Contract deployment failed: {}", e),
                                }
                            },
                            crate::core::TransactionType::ContractCall { ref target, ref data } => {
                                // Institutional interaction with smart contract state
                                match vm_loop.execute_transaction(&tx.sender, target, data.clone(), tx.amount) {
                                    Ok(_) => {
                                        storage_loop.increment_nonce(&tx.sender);
                                        info!("CONTRACT CALL successful to {} from {}", target, tx.sender);
                                    },
                                    Err(e) => warn!("Contract call failed: {}", e),
                                }
                            },
                            _ => {
                                // Default increment for other types to prevent stuck mempool
                                storage_loop.increment_nonce(&tx.sender);
                            }
                        }
                    }

                    // 3. Construct and Save Block
                    let mut block = Block {
                        header: crate::core::BlockHeader {
                            parent_hash: storage_loop.get_block(engine.height - 1).map(|b| b.hash()).unwrap_or_default(),
                            timestamp: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs(),
                            height: engine.height,
                            state_root: storage_loop.calculate_state_root(), 
                            tx_merkle_root: "0".to_string(),
                        },
                        transactions: current_txs,
                    };
                    block.header.tx_merkle_root = block.calculate_merkle_root();
                    
                    storage_loop.save_block(&block);
                    
                    // 4. Finalize height in engine
                    engine.next_step(&storage_loop, Some(&block));
                }
            }
        }
    });

    let mut io = IoHandler::default();

    // RPC: aureum_getChainState
    let storage_rpc = storage.clone();
    io.add_method("aureum_getChainState", move |_| {
        let storage = storage_rpc.clone();
        async move {
            let state = storage.get_chain_state().unwrap();
            Ok(serde_json::to_value(state).unwrap())
        }
    });

    // RPC: aureum_registerComplianceProfile (Priority 4)
    let comp_clone = compliance_engine.clone();
    io.add_method("aureum_registerComplianceProfile", move |params: Params| {
        let comp = comp_clone.clone();
        async move {
            let profile: ComplianceProfile = params.parse().expect("Invalid profile data");
            comp.lock().await.register_profile(profile);
            Ok(Value::Bool(true))
        }
    });

    // RPC: aureum_submitOracleReport (Priority 5)
    let oracle_clone = oracle.clone();
    io.add_method("aureum_submitOracleReport", move |params: Params| {
        let oracle = oracle_clone.clone();
        async move {
            let report: OracleReport = params.parse().expect("Invalid oracle report");
            oracle.lock().await.submit_report(report);
            Ok(Value::Bool(true))
        }
    });

    // RPC: aureum_getOraclePrice (Priority 5)
    let oracle_clone_2 = oracle.clone();
    io.add_method("aureum_getOraclePrice", move |params: Params| {
        let oracle = oracle_clone_2.clone();
        async move {
            let asset_id: String = params.parse().expect("Invalid asset ID");
            let price = oracle.lock().await.get_price(&asset_id);
            Ok(match price {
                Some(p) => Value::Number(p.into()),
                None => Value::Null,
            })
        }
    });

    // RPC: aureum_call (AVM Execution)
    let vm_clone = vm.clone();
    io.add_method("aureum_call", move |params: Params| {
        let vm = vm_clone.clone();
        async move {
            let (caller, target, data): (String, String, String) = params.parse()
                .expect("Expected (caller, target, data_hex)");
            let data_bytes = hex::decode(data.replace("0x", "")).unwrap_or_default();
            
            match vm.execute_call(&caller, &target, data_bytes, 0) {
                Ok(result) => Ok(Value::String(format!("{:?}", result))),
                Err(e) => Ok(Value::String(format!("Error: {}", e))),
            }
        }
    });

    // RPC: aureum_estimateGas
    io.add_method("aureum_estimateGas", move |_| async {
        Ok(Value::String("21000".to_string())) // Mock
    });

    // RPC: aureum_getNetworkStatus
    let engine_clone = engine.clone();
    let peer_count_rpc = peer_count.clone();
    io.add_method("aureum_getNetworkStatus", move |_| {
        let engine = engine_clone.clone();
        let p_count = peer_count_rpc.clone();
        async move {
            let e = engine.lock().await;
            let peers = p_count.lock().await;
            Ok(Value::String(format!("Height: {}, Step: {:?}, Validators: {}, Peers: {}", 
                e.height, e.step, e.validator_set.validators.len(), *peers)))
        }
    });

    // RPC: aureum_getPeers
    let peer_count_rpc_2 = peer_count.clone();
    io.add_method("aureum_getPeers", move |_| {
        let p_count = peer_count_rpc_2.clone();
        async move {
            let count = p_count.lock().await;
            Ok(Value::Number((*count as u64).into()))
        }
    });

    // RPC: aureum_getValidators
    let storage_clone = storage.clone();
    io.add_method("aureum_getValidators", move |_| {
        let storage = storage_clone.clone();
        async move {
            let set = storage.get_validator_set().unwrap();
            Ok(serde_json::to_value(set.validators).unwrap())
        }
    });

    // RPC: aureum_getBalance
    let storage_clone = storage.clone();
    io.add_method("aureum_getBalance", move |params: Params| {
        let storage = storage_clone.clone();
        async move {
            let address: String = params.parse().expect("Invalid address parameter");
            let balance = storage.get_balance(&address);
            Ok(Value::String(format!("{}", balance)))
        }
    });

    // RPC: aureum_getProperty (Part 4.2.B)
    let storage_prop = storage.clone();
    io.add_method("aureum_getProperty", move |params: Params| {
        let storage = storage_prop.clone();
        async move {
            let id: String = params.parse().expect("Invalid property ID");
            match storage.get_property(&id) {
                Some(p) => Ok(serde_json::to_value(p).unwrap()),
                None => Ok(Value::Null),
            }
        }
    });

    // RPC: aureum_getVisaStatus (Section 1.3.B)
    let storage_visa = storage.clone();
    io.add_method("aureum_getVisaStatus", move |params: Params| {
        let storage = storage_visa.clone();
        async move {
            let applicant: String = params.parse().expect("Invalid applicant address");
            match storage.get_visa_application(&applicant) {
                Some(v) => Ok(serde_json::to_value(v).unwrap()),
                None => Ok(Value::Null),
            }
        }
    });

    // RPC: aureum_sendTransaction
    let tx_broadcaster = tx_sender.clone();
    let vm_compliance = vm.clone();
    let mempool_rpc = mempool.clone();
    io.add_method("aureum_sendTransaction", move |params: Params| {
        let broadcaster = tx_broadcaster.clone();
        let vm = vm_compliance.clone();
        let mempool = mempool_rpc.clone();
        async move {
            let tx_hex: String = params.parse().expect("Invalid transaction hex");
            let tx_bytes = hex::decode(tx_hex.replace("0x", "")).expect("Invalid hex");
            
            // Priority 4 Hook: Compliance Enforcement
            if !vm.verify_compliance(&tx_bytes) {
                warn!("Compliance check failed for transaction broadcast");
                return Err(jsonrpc_http_server::jsonrpc_core::Error::invalid_params("Compliance Verification Failed"));
            }

            // Decode and Securely Verify Transaction
            if let Ok(tx) = crate::core::Transaction::decode(&mut &tx_bytes[..]) {
                // Cryptographic Signature Check (Security Roadmap 1.2.F)
                if !tx.verify_signature() {
                    warn!("Invalid cryptographic signature for transaction from {}", tx.sender);
                    return Err(jsonrpc_http_server::jsonrpc_core::Error::invalid_params("Invalid Cryptographic Signature"));
                }

                let mut pool = mempool.lock().await;
                pool.push(tx);
                info!("Transaction verified and entered mempool. Total: {}", pool.len());
            } else {
                return Err(jsonrpc_http_server::jsonrpc_core::Error::invalid_params("Transaction Decoding Failed"));
            }

            if let Err(e) = broadcaster.send(tx_bytes).await {
                error!("Failed to queue transaction for broadcast: {:?}", e);
                return Err(jsonrpc_http_server::jsonrpc_core::Error::internal_error());
            }

            Ok(Value::String("0x...hash...".to_string()))
        }
    });

    let server = ServerBuilder::new(io)
        .start_http(&"127.0.0.1:3030".parse().unwrap())
        .expect("Unable to start RPC server");

    info!("Aureum JSON-RPC Server available at http://127.0.0.1:3030");
    
    server.wait();
}
