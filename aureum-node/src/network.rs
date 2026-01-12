use libp2p::{
    gossipsub,
    kad,
    identify,
    mdns,
    noise,
    tcp,
    yamux,
    PeerId,
    Swarm,
    SwarmBuilder,
    StreamProtocol,
};
use libp2p::swarm::{NetworkBehaviour, SwarmEvent};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::time::Duration;
use tokio::sync::mpsc;
use log::{info, warn, error};
use futures::StreamExt;

// Gossip Topics
pub const TOPIC_TRANSACTIONS: &str = "aureum_tx";
pub const TOPIC_BLOCKS: &str = "aureum_blocks";

#[derive(NetworkBehaviour)]
pub struct AureumBehaviour {
    pub gossipsub: gossipsub::Behaviour,
    pub kademlia: kad::Behaviour<kad::store::MemoryStore>,
    pub mdns: mdns::tokio::Behaviour,
    pub identify: identify::Behaviour,
}

pub struct P2PNetwork {
    pub swarm: Swarm<AureumBehaviour>,
    pub local_peer_id: PeerId,
}

impl P2PNetwork {
    pub async fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let local_key = libp2p::identity::Keypair::generate_ed25519();
        let local_peer_id = PeerId::from(local_key.public());
        info!("Local Peer ID: {}", local_peer_id);

        let swarm = SwarmBuilder::with_existing_identity(local_key)
            .with_tokio()
            .with_tcp(
                tcp::Config::default(),
                noise::Config::new,
                yamux::Config::default,
            )?
            .with_dns()?
            .with_behaviour(|key| {
                // Setup Gossipsub
                let message_id_fn = |message: &gossipsub::Message| {
                    let mut s = DefaultHasher::new();
                    message.data.hash(&mut s);
                    gossipsub::MessageId::from(s.finish().to_string())
                };

                let gossipsub_config = gossipsub::ConfigBuilder::default()
                    .heartbeat_interval(Duration::from_secs(10))
                    .validation_mode(gossipsub::ValidationMode::Strict) // Mandatory for Security Roadmap 1.2.A
                    .message_id_fn(message_id_fn)
                    .max_transmit_size(10 * 1024 * 1024) // 10MB limit for institutional blocks
                    .duplicate_cache_time(Duration::from_secs(60))
                    .build()
                    .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

                let gossipsub = gossipsub::Behaviour::new(
                    gossipsub::MessageAuthenticity::Signed(key.clone()),
                    gossipsub_config,
                )?;

                // Setup Kademlia
                let mut kad_config = kad::Config::default();
                kad_config.set_protocol_names(vec![StreamProtocol::new("/aureum/kad/1.0.0")]);
                let kademlia = kad::Behaviour::with_config(
                    local_peer_id,
                    kad::store::MemoryStore::new(local_peer_id),
                    kad_config,
                );

                // Setup MDNS
                let mdns = mdns::tokio::Behaviour::new(mdns::Config::default(), local_peer_id)?;

                // Setup Identify
                let identify = identify::Behaviour::new(identify::Config::new(
                    "/aureum/1.0.0".to_string(),
                    key.public(),
                ));

                Ok(AureumBehaviour { gossipsub, kademlia, mdns, identify })
            })?
            .with_swarm_config(|c| c.with_idle_connection_timeout(Duration::from_secs(60)))
            .build();

        Ok(Self { swarm, local_peer_id })
    }

    pub fn subscribe(&mut self, topic: &str) {
        let topic = gossipsub::IdentTopic::new(topic);
        self.swarm.behaviour_mut().gossipsub.subscribe(&topic).unwrap();
    }

    pub fn broadcast(&mut self, topic: &str, data: Vec<u8>) {
        let topic = gossipsub::IdentTopic::new(topic);
        if let Err(e) = self.swarm.behaviour_mut().gossipsub.publish(topic, data) {
            warn!("Failed to publish P2P message: {:?}", e);
        }
    }
}
