use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use log::{info, warn};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OracleReport {
    pub asset_id: String,
    pub price_eur: u64,
    pub timestamp: u64,
    pub reporter: String,
    pub signature: Vec<u8>,
}

pub struct AureumOracle {
    // Stores aggregated prices for property assets
    asset_prices: HashMap<String, u64>,
    // Track reports to reaches 2/3 agreement
    pending_reports: HashMap<String, Vec<OracleReport>>,
    authorized_reporters: Vec<String>,
}

impl AureumOracle {
    pub fn new(reporters: Vec<String>) -> Self {
        Self {
            asset_prices: HashMap::new(),
            pending_reports: HashMap::new(),
            authorized_reporters: reporters,
        }
    }

    pub fn submit_report(&mut self, report: OracleReport) {
        if !self.authorized_reporters.contains(&report.reporter) {
            warn!("Unauthorized oracle report from {}", report.reporter);
            return;
        }

        let reports = self.pending_reports.entry(report.asset_id.clone()).or_insert(vec![]);
        reports.push(report.clone());

        // Simple aggregation logic: if we have 2/3 agreement (or just 2 reports for now)
        if reports.len() >= 2 {
            self.finalize_price(&report.asset_id);
        }
    }

    fn finalize_price(&mut self, asset_id: &str) {
        let reports = self.pending_reports.get(asset_id).unwrap();
        
        // Use average price for simplicity in this version
        let total: u64 = reports.iter().map(|r| r.price_eur).sum();
        let avg = total / reports.len() as u64;

        info!("Oracle Price Finalized for {}: €{}", asset_id, avg);
        self.asset_prices.insert(asset_id.to_string(), avg);
        self.pending_reports.remove(asset_id);
    }

    pub fn get_price(&self, asset_id: &str) -> Option<u64> {
        self.asset_prices.get(asset_id).cloned()
    }
}
