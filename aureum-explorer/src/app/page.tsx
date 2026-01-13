"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Box, Activity, Cpu, Globe, ArrowRightLeft,
  ChevronRight, ArrowUpRight, Clock, ShieldCheck,
  Zap, Database, Server, RefreshCcw, Home,
  CreditCard, Landmark, ExternalLink, ArrowLeft,
  Lock, CheckCircle2, User, MapPin, Building2,
  FileText, TrendingUp, Layers, Wallet
} from "lucide-react";

import { getLatestBlock, getRecentBlocks, isNodeOnline, RPC_URL } from "../lib/blockchain";

type ViewType = "home" | "blocks" | "transactions" | "markets" | "assets" | "block_detail" | "tx_detail";

export default function AureumExplorer() {
  const [scrolled, setScrolled] = useState(false);
  const [view, setView] = useState<ViewType>("home");
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);

  const [latestBlock, setLatestBlock] = useState<any>(null);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);

    // Initial fetch
    fetchData();

    // Polling
    const interval = setInterval(fetchData, 3000);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      clearInterval(interval);
    };
  }, []);

  const fetchData = async () => {
    const online = await isNodeOnline();
    setIsOnline(online);
    if (!online) return;

    const lb = await getLatestBlock();
    setLatestBlock(lb);

    const recentBlocks = await getRecentBlocks(10);
    setBlocks(recentBlocks);

    // Extract transactions from blocks
    const txs: any[] = [];
    if (recentBlocks) {
      recentBlocks.forEach(b => {
        if (b && b.transactions) {
          b.transactions.forEach((tx: any) => {
            txs.push({ ...tx, blockHeight: b.header.height, timestamp: b.header.timestamp });
          });
        }
      });
    }
    setTransactions(txs.slice(0, 10));
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery) return;

    if (searchQuery.startsWith("0x") || searchQuery.startsWith("A")) {
      // Search for transaction by hash
      const foundTx = transactions.find(tx => tx.hash === searchQuery);
      if (foundTx) {
        openTx(foundTx);
      } else {
        // If not found in current list, create a minimal object with the hash
        openTx({ hash: searchQuery, amount: 0, sender: "Unknown", receiver: "Unknown", fee: 0, nonce: 0 });
      }
    } else if (!isNaN(Number(searchQuery))) {
      openBlock(Number(searchQuery));
    } else {
      alert("Invalid input. Enter a block number or transaction hash.");
    }
  };

  const openBlock = (blockNumber: number) => {
    setSelectedItem({ number: blockNumber });
    setView("block_detail");
    window.scrollTo(0, 0);
  };

  const openTx = (tx: any) => {
    setSelectedItem(tx);
    setIsTxModalOpen(true);
  };

  const navigateTo = (newView: ViewType) => {
    setView(newView);
    setSelectedItem(null);
    window.scrollTo(0, 0);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-red-500/30 overflow-x-hidden mesh-gradient">

      {/* Floating Navigation */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 px-8 py-4 ${scrolled ? "bg-black/80 backdrop-blur-xl border-b border-white/5 py-3" : "py-6"}`}>
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div onClick={() => navigateTo("home")} className="flex items-center gap-4 group cursor-pointer">
            <img src="/assets/logo.png" alt="Aureum" className="w-10 h-10 shadow-[0_0_20px_rgba(232,65,66,0.2)] group-hover:scale-110 transition-transform" />
            <div>
              <h1 className="text-xl font-bold tracking-tighter leading-none uppercase">AUREUM <span className="text-red-500 italic">SCAN</span></h1>
              <span className="text-[8px] uppercase tracking-[0.4em] text-gray-500 font-bold">Institutional Intelligence</span>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-10">
            {[
              { label: "Blocks", v: "blocks" },
              { label: "Transactions", v: "transactions" },
              { label: "Markets", v: "markets" },
              { label: "Assets", v: "assets" }
            ].map((item) => (
              <button
                key={item.label}
                onClick={() => navigateTo(item.v as ViewType)}
                className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${view === item.v ? "text-red-500" : "text-gray-500 hover:text-red-400"}`}
              >
                {item.label}
              </button>
            ))}
            <button className="bg-white/5 hover:bg-white/10 border border-white/10 px-5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all">Mainnet v0.1.0</button>
          </div>
        </div>
      </nav>

      <AnimatePresence mode="wait">
        {view === "home" && (
          <motion.div
            key="home"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="pt-40 pb-40"
          >
            {/* Hero Search Section */}
            <div className="max-w-3xl mx-auto text-center px-8 mb-20">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
                <h2 className="text-sm font-bold uppercase tracking-[0.8em] text-red-500 mb-6 shimmer-text">Immersive Intelligence</h2>
                <h1 className="text-5xl md:text-6xl font-premium font-bold mb-10 tracking-tighter leading-none">
                  Universal <span className="text-red-500 italic">Ledger</span> Query
                </h1>

                <form onSubmit={handleSearch} className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-red-600 to-red-900 rounded-2xl blur opacity-10 group-focus-within:opacity-40 transition-opacity"></div>
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search Block / Tx Hash"
                      className="w-full bg-[#0D0D0D] border border-white/5 rounded-2xl py-5 px-8 pl-14 text-lg placeholder:text-gray-700 outline-none focus:border-red-500/50 transition-all font-premium tracking-tight shadow-2xl"
                    />
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-red-500 transition-colors" size={20} />
                    <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 btn-primary !py-2.5 !text-[10px]">Execute</button>
                  </div>
                </form>
              </motion.div>
            </div>

            <main className="max-w-7xl mx-auto px-8 space-y-20">
              {/* Real-time Network Matrix */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <MetricCard label="AUR Evaluation" value="€2.45" trend="+4.2%" icon={<Activity className="text-emerald-500" />} />
                <MetricCard label="Network Status" value={isOnline ? "OPERATIONAL" : "OFFLINE"} trend={isOnline ? "Live" : "Down"} icon={<Zap className={isOnline ? "text-emerald-500" : "text-red-500"} />} />
                <MetricCard label="Asset Liquidity" value="€2.45B" trend="Stable" icon={<Landmark className="text-gray-400" />} />
                <MetricCard label="Current Block" value={latestBlock ? `#${latestBlock.header.height}` : "SYNCING..."} trend="Synced" icon={<Box className="text-gray-400" />} />
              </div>

              <div className="grid grid-cols-12 gap-10">
                {/* Latest Block Stream */}
                <div className="col-span-12 lg:col-span-6">
                  <div className="flex justify-between items-end mb-8">
                    <div>
                      <h3 className="text-xs uppercase tracking-[0.4em] text-gray-500 font-bold mb-2">Network Pulse</h3>
                      <h2 className="text-4xl font-premium font-bold italic">Latest Blocks</h2>
                    </div>
                    <button onClick={() => navigateTo("blocks")} className="text-xs font-bold text-red-500 border-b border-red-500/20 pb-1">View All</button>
                  </div>
                  <div className="space-y-4">
                    {blocks.map((block, i) => (
                      <BlockRow key={block.header.height || i} number={block.header.height} timestamp={block.header.timestamp} txCount={block.transactions.length} i={i} onClick={() => openBlock(block.header.height)} />
                    ))}
                    {blocks.length === 0 && (
                      <div className="text-center py-10 text-gray-600 font-bold uppercase italic tracking-widest bg-white/5 rounded-2xl">Genesis Awaiting Blocks</div>
                    )}
                  </div>
                </div>

                {/* Institutional Transactions */}
                <div className="col-span-12 lg:col-span-6">
                  <div className="flex justify-between items-end mb-8">
                    <div>
                      <h3 className="text-xs uppercase tracking-[0.4em] text-gray-500 font-bold mb-2">Network activity</h3>
                      <h2 className="text-4xl font-premium font-bold italic">Latest Transactions</h2>
                    </div>
                    <button onClick={() => navigateTo("transactions")} className="text-xs font-bold text-red-500 border-b border-red-500/20 pb-1">View All</button>
                  </div>
                  <div className="space-y-4">
                    {transactions.map((tx, i) => (
                      <TxRow key={i} tx={tx} onClick={() => openTx(tx)} />
                    ))}
                    {transactions.length === 0 && (
                      <div className="text-center py-10 text-gray-600 font-bold uppercase italic tracking-widest bg-white/5 rounded-2xl">No Recent Transactions</div>
                    )}
                  </div>
                </div>
              </div>
            </main>
          </motion.div>
        )}

        {view === "blocks" && (
          <motion.div key="blocks" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-32 pb-40 px-8 max-w-7xl mx-auto">
            <h2 className="text-xs font-bold uppercase tracking-[0.6em] text-red-500 mb-2">Immutable History</h2>
            <h1 className="text-6xl font-premium font-bold italic mb-12">Universal Block Pulse</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {blocks.map((block, i) => (
                <BlockRow key={i} number={block.header.height} timestamp={block.header.timestamp} txCount={block.transactions.length} i={i} onClick={() => openBlock(block.header.height)} />
              ))}
            </div>
          </motion.div>
        )}

        {view === "transactions" && (
          <motion.div key="transactions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-32 pb-40 px-8 max-w-7xl mx-auto">
            <h2 className="text-xs font-bold uppercase tracking-[0.6em] text-red-500 mb-2">Institutional Ledger</h2>
            <h1 className="text-6xl font-premium font-bold italic mb-12">Transaction History</h1>
            <div className="space-y-4">
              {transactions.map((tx, i) => (
                <TxRow key={i} tx={tx} onClick={() => openTx(tx)} />
              ))}
            </div>
          </motion.div>
        )}

        {view === "markets" && (
          <motion.div key="markets" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-32 pb-40 px-8 max-w-7xl mx-auto text-center">
            <h1 className="text-6xl font-premium font-bold italic mb-6">Market Intelligence</h1>
            <p className="text-gray-500 max-w-2xl mx-auto mb-16 text-lg">Bespoke pricing engines and liquidity depth across tokenized office and retail portfolios.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <MarketDeepCard title="Lisbon Prime" cap="€1.2B" yield="8.4%" assets="12 Projects" />
              <MarketDeepCard title="Dubai Marina" cap="€4.8B" yield="12.2%" assets="45 Projects" />
              <MarketDeepCard title="London Mayfair" cap="€8.5B" yield="6.1%" assets="8 Projects" />
            </div>
          </motion.div>
        )}

        {view === "assets" && (
          <motion.div key="assets" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-32 pb-40 px-8 max-w-7xl mx-auto">
            <h1 className="text-6xl font-premium font-bold italic mb-12">Verified Real Estate Assets</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <AssetDeepCard name="The Platinum Tower" location="Dubai, UAE" evaluation="€1.2B" type="Commercial REIT" />
              <AssetDeepCard name="Royal Gardens" location="Cascais, Portugal" evaluation="€45M" type="Residential" />
              <AssetDeepCard name="Mayfair Hub" location="London, UK" evaluation="€850M" type="Bespoke Retail" />
              <AssetDeepCard name="Marina Penthouse" location="Dubai, UAE" evaluation="€12M" type="Residential" />
            </div>
          </motion.div>
        )}

        {view === "block_detail" && (
          <motion.div key="block_detail" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="pt-32 pb-40 px-8 max-w-4xl mx-auto">
            <button onClick={() => navigateTo("blocks")} className="mb-10 flex items-center gap-2 text-gray-500 hover:text-white group transition-all">
              <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> Back to Pulse
            </button>
            <div className="flex justify-between items-end mb-12">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-[0.4em] text-red-500 mb-2">Block Details</h3>
                <h1 className="text-6xl font-premium font-bold italic tracking-tighter">{selectedItem.number}</h1>
              </div>
              <div className="status-badge bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-4 py-2 flex items-center gap-2">
                <CheckCircle2 size={14} /> Confirmed
              </div>
            </div>
            <div className="space-y-6">
              <DetailRow label="Block Hash" value="0x8f2a4d3c9e1b7a5f0c2e4d3c9e1b7a5f0c2e4d3c9e1b7a5f0c2e4d3c9e1b7a5f" copyable />
              <DetailRow label="Timestamp" value="Jan 12, 2026 17:15:22 (+01:00)" />
              <DetailRow label="Transactions" value="42 Transactions finalized" />
              <DetailRow label="Proposer" value="aurCore_Validator_12 (aur1k5p...9m4d)" isLink />
              <DetailRow label="Block Reward" value="2.456 AUR" />
              <DetailRow label="Gas Efficiency" value="12,450,120 / 30,000,000 (41.5%)" />
            </div>
          </motion.div>
        )}

      </AnimatePresence>

      {isTxModalOpen && selectedItem && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-6 h-screen overflow-hidden"
        >
          <div className="max-w-6xl w-full h-[90vh] core-card p-10 glass-panel border-white/10 flex flex-col relative overflow-y-auto custom-scrollbar">
            <button
              onClick={() => setIsTxModalOpen(false)}
              className="fixed top-10 right-10 btn-outline px-6 py-2 z-50 bg-black/50 backdrop-blur-md border-red-500/50 text-red-500 hover:bg-red-500 hover:text-white transition-all shadow-xl"
            >
              Close View
            </button>

            <div className="flex flex-col lg:flex-row justify-between items-start gap-8 mb-16 pt-12">
              <div className="w-full">
                <div className="flex items-center gap-4 mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-[0.4em] text-red-500">Transaction Details</h3>
                  <div className="h-px flex-1 bg-red-500/20 w-24"></div>
                </div>
                {/* PADDING ADDED HERE */}
                <div className="pt-8 pb-4">
                  <h1 className="text-3xl lg:text-4xl font-premium font-bold italic tracking-tighter break-all">{selectedItem.hash || "N/A"}</h1>
                  <a href="#" className="text-[10px] text-red-500 hover:text-white uppercase font-bold tracking-widest mt-2 inline-flex items-center gap-1 transition-colors">
                    <ExternalLink size={10} /> View on Stablecoin Registry
                  </a>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-10">
              {/* Main Transaction Card */}
              <div className="lg:col-span-2 space-y-6">
                <div className="explorer-card p-0 overflow-hidden">
                  <div className="p-8 border-b border-white/5 bg-white/[0.02]">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="text-[10px] uppercase text-gray-500 font-bold tracking-widest mb-1">Total Value</div>
                        <div className="text-4xl font-premium font-bold italic text-white">{(selectedItem.amount || 0).toLocaleString()} <span className="text-red-500">AUR</span></div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] uppercase text-gray-500 font-bold tracking-widest mb-1">Fee</div>
                        <div className="text-xl font-bold font-mono text-gray-300">{selectedItem.fee || 0} AUR</div>
                      </div>
                    </div>
                  </div>

                  <div className="p-8 space-y-12">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative">
                      {/* Connector Line */}
                      <div className="absolute left-1/2 top-8 bottom-8 w-px bg-gradient-to-b from-transparent via-red-500/20 to-transparent hidden md:block -ml-px"></div>

                      <div className="flex-1 w-full relative z-10">
                        <div className="flex-1">
                          <div className="text-[10px] uppercase text-gray-500 font-bold mb-3 tracking-widest">From Sender</div>
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/5"><User size={22} className="text-gray-400" /></div>
                            <div><div className="text-sm font-bold text-gray-200">Origin Wallet</div><div className="text-[10px] text-gray-500 font-mono italic">{selectedItem.sender}</div></div>
                          </div>
                        </div>
                      </div>

                      <div className="relative z-10">
                        <div className="w-12 h-12 rounded-full bg-[#0A0A0A] border border-white/10 flex items-center justify-center text-red-500 shadow-xl shadow-red-900/10">
                          <ArrowRightLeft size={20} />
                        </div>
                      </div>

                      <div className="flex-1 w-full text-right relative z-10">
                        <div className="flex flex-col items-end">
                          <div className="flex-1">
                            <div className="text-[10px] uppercase text-gray-500 font-bold mb-3 tracking-widest">To Receiver</div>
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/5"><User size={22} className="text-gray-400" /></div>
                              <div><div className="text-sm font-bold text-gray-200">Target Wallet</div><div className="text-[10px] text-gray-500 font-mono italic">{selectedItem.receiver}</div></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-8 border-t border-white/5">
                      <div>
                        <div className="text-[10px] uppercase text-gray-500 font-bold tracking-widest mb-2">Block Height</div>
                        <div className="flex items-center gap-2">
                          <Layers size={14} className="text-gray-600" />
                          <span className="font-mono text-sm text-gray-300">#{selectedItem.blockHeight || "Pending"}</span>
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase text-gray-500 font-bold tracking-widest mb-2">Timestamp</div>
                        <div className="flex items-center gap-2">
                          <Clock size={14} className="text-gray-600" />
                          <span className="font-mono text-sm text-gray-300">{selectedItem.timestamp ? new Date(selectedItem.timestamp * 1000).toLocaleString() : "Just now"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                <div className="explorer-card p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-white/5 rounded-lg"><Database size={16} className="text-gray-400" /></div>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-white">Technical Data</h3>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <div className="text-[10px] uppercase text-gray-600 font-bold mb-1">Transaction Type</div>
                      <div className="text-sm font-bold bg-white/5 inline-block px-3 py-1 rounded border border-white/5">
                        {selectedItem.tx_type || "Standard Transfer"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-gray-600 font-bold mb-1">Nonce</div>
                      <div className="font-mono text-sm text-gray-400">#{selectedItem.nonce}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-gray-600 font-bold mb-1">Signature Hash</div>
                      <div className="font-mono text-[10px] leading-relaxed text-gray-500 break-all bg-black/20 p-3 rounded-lg border border-white/5">
                        {selectedItem.signature ? Array.from(selectedItem.signature).slice(0, 32).map((b: any) => b.toString(16).padStart(2, '0')).join('') : 'N/A'}...
                      </div>
                    </div>
                  </div>
                </div>

                <div className="explorer-card p-8 bg-gradient-to-br from-red-900/10 to-transparent border-red-500/10">
                  <div className="flex items-center gap-3 mb-4">
                    <ShieldCheck size={16} className="text-red-500" />
                    <h3 className="text-xs font-bold uppercase tracking-widest text-red-400">Compliance Check</h3>
                  </div>
                  <div className="space-y-3">
                    {['KYC Verified', 'Anti-Money Laundering', 'Jurisdiction Clear'].map((check, i) => (
                      <div key={i} className="flex items-center gap-3 text-xs text-green-400/80 font-medium">
                        <CheckCircle2 size={12} /> {check}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Footer */}
      <footer className="border-t border-white/5 bg-black py-20 px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start gap-20">
          <div className="max-w-sm">
            <div className="flex items-center gap-4 mb-8">
              <img src="/assets/logo.png" alt="Aureum" className="w-10 h-10" />
              <h1 className="text-2xl font-bold tracking-tighter leading-none">AUREUM <span className="text-red-500 italic text-sm">SCAN</span></h1>
            </div>
            <p className="text-gray-500 text-sm leading-relaxed mb-8 italic">Transparency built for luxury. The institutional real estate ledger.</p>
          </div>
          <div className="grid grid-cols-3 gap-20 flex-1">
            <FooterColumn title="Explorer" items={["Blocks", "Transactions", "Markets", "Assets"]} />
            <FooterColumn title="Developers" items={["Bespoke API", "SDK Docs", "Node Specs", "Validator Suite"]} />
            <FooterColumn title="Protocol" items={["Governance", "Whitepaper", "Security Audit", "Brand Assets"]} />
          </div>
        </div>
      </footer>
    </div >
  );
}

function BlockRow({ number, timestamp, txCount, i, onClick }: { number: number, timestamp: number, txCount: number, i: number, onClick: () => void }) {
  const timeAgo = Math.floor(Date.now() / 1000) - timestamp;

  return (
    <div onClick={onClick} className="explorer-card group cursor-pointer p-6 flex items-center gap-6">
      <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-red-500 group-hover:bg-red-600 group-hover:text-white transition-all shadow-inner"><Box size={24} /></div>
      <div className="flex-1">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-lg font-bold font-premium">{number}</span>
          <span className="text-[10px] bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded font-bold uppercase tracking-widest">Finalized</span>
        </div>
        <div className="text-xs text-gray-500 flex items-center gap-4">
          <span className="flex items-center gap-1"><Clock size={12} /> {timeAgo < 60 ? 'Just now' : `${Math.floor(timeAgo / 60)}m ago`}</span>
        </div>
      </div>
      <div className="text-right">
        <div className="text-lg font-bold font-premium tracking-tighter uppercase">{txCount} <span className="text-[10px] opacity-40">Assets</span></div>
      </div>
    </div>
  );
}

function TxRow({ tx, onClick }: { tx: any, onClick: () => void }) {
  const isEscrow = tx.tx_type === 'EscrowPayment' || (tx.tx_type && tx.tx_type.EscrowPayment);

  return (
    <div onClick={onClick} className="explorer-card group cursor-pointer p-6 flex items-center gap-6 border-l-2 border-l-red-500/0 hover:border-l-red-500 transition-all">
      <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-gray-500 group-hover:text-red-500 transition-colors">{isEscrow ? <Home size={24} /> : <Zap size={24} />}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-bold text-gray-300 truncate lowercase font-mono">{tx.hash}</span>
          {isEscrow && <span className="text-[8px] bg-red-600 text-white px-2 py-0.5 rounded-full font-bold uppercase">Escrow</span>}
          <span className="text-[10px] bg-white/5 text-gray-500 px-2 py-0.5 rounded uppercase font-bold tracking-widest">Block #{tx.blockHeight}</span>
        </div>
        <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="opacity-40">FROM</span> <span className="text-gray-400 font-mono tracking-normal">{tx.sender}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="opacity-40">TO</span> <span className="text-red-500/60 font-mono tracking-normal">{tx.receiver}</span>
          </div>
        </div>
      </div>
      <div className="text-right min-w-[120px]">
        <div className={`text-xl font-bold font-premium tracking-tighter ${isEscrow ? "text-red-500" : "text-white"}`}>{tx.amount.toLocaleString()} AUR</div>
        <div className="text-[10px] text-gray-600 font-bold uppercase">Fee: {tx.fee} AUR</div>
      </div>
    </div>
  );
}

function MarketDeepCard({ title, cap, yield: y, assets }: { title: string, cap: string, yield: string, assets: string }) {
  return (
    <div className="explorer-card p-10 group hover:border-red-500/30 transition-all text-left">
      <h3 className="text-3xl font-premium font-bold italic mb-6">{title}</h3>
      <div className="space-y-6">
        <div><div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-1">Market Cap</div><div className="text-2xl font-premium font-bold">{cap}</div></div>
        <div className="grid grid-cols-2 gap-4 pt-6 border-t border-white/5">
          <div><div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-1">APY</div><div className="text-lg font-bold text-emerald-500">{y}</div></div>
          <div><div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-1">Assets</div><div className="text-lg font-bold">{assets}</div></div>
        </div>
      </div>
    </div>
  );
}

function AssetDeepCard({ name, location, evaluation, type }: { name: string, location: string, evaluation: string, type: string }) {
  return (
    <div className="explorer-card p-8 group flex items-center gap-8 border-white/5 hover:border-red-500/20 transition-all">
      <div className="w-24 h-24 rounded-3xl bg-white/5 flex items-center justify-center text-red-500"><Building2 size={40} /></div>
      <div className="flex-1">
        <div className="text-[10px] uppercase text-red-500 font-bold mb-1 tracking-widest">{type}</div>
        <h3 className="text-3xl font-premium font-bold mb-2">{name}</h3>
        <div className="flex items-center gap-2 text-gray-500 text-xs font-bold uppercase"><MapPin size={14} /> {location}</div>
      </div>
      <div className="text-right">
        <div className="text-[10px] uppercase text-gray-500 font-bold mb-1 tracking-widest">Equity Val</div>
        <div className="text-2xl font-premium font-bold italic">{evaluation}</div>
      </div>
    </div>
  );
}

function ComplianceStep({ label, done }: { label: string, done: boolean }) {
  return (
    <div className="flex items-center gap-4">
      <div className={`w-5 h-5 rounded-full flex items-center justify-center border ${done ? "border-emerald-500 text-emerald-500 bg-emerald-500/5" : "border-gray-800 text-gray-800"}`}>
        {done && <CheckCircle2 size={12} />}
      </div>
      <span className={`text-[11px] font-bold uppercase tracking-widest ${done ? "text-gray-300" : "text-gray-600"}`}>{label}</span>
    </div>
  );
}

function DetailRow({ label, value, copyable, isLink }: { label: string, value: string, copyable?: boolean, isLink?: boolean }) {
  return (
    <div className="explorer-card p-6 flex flex-col md:flex-row md:items-center gap-4 transition-colors hover:bg-white/5">
      <div className="w-48 text-[10px] uppercase text-gray-500 font-black tracking-widest">{label}</div>
      <div className={`flex-1 font-mono text-xs leading-relaxed ${isLink ? "text-red-500 cursor-pointer hover:underline" : "text-gray-300"}`}>{value}</div>
      {copyable && <button className="text-gray-600 hover:text-white transition-colors uppercase text-[8px] font-bold tracking-widest px-3 py-1 bg-white/5 rounded">Copy</button>}
    </div>
  );
}

function AssetAddress({ label, address, title }: { label: string, address: string, title: string }) {
  return (
    <div className="flex-1">
      <div className="text-[10px] uppercase text-gray-500 font-bold mb-3 tracking-widest">{label}</div>
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/5"><User size={22} className="text-gray-400" /></div>
        <div><div className="text-sm font-bold text-gray-200">{title}</div><div className="text-[10px] text-gray-500 font-mono italic">{address}</div></div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, trend, icon }: { label: string, value: string, trend: string, icon: React.ReactNode }) {
  return (
    <div className="explorer-card p-8 group overflow-hidden">
      <div className="absolute top-0 right-0 w-24 h-24 bg-red-600/5 blur-[40px] -mr-12 -mt-12 rounded-full group-hover:bg-red-600/10 transition-colors"></div>
      <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 mb-6">{icon} {label}</div>
      <div className="flex items-end justify-between">
        <div className="text-3xl font-premium font-bold italic tracking-tighter">{value}</div>
        <div className="text-[10px] font-black italic text-emerald-500 uppercase tracking-widest flex items-center gap-1 group-hover:gap-2 transition-all">{trend} <ChevronRight size={10} /></div>
      </div>
    </div>
  );
}

function FooterColumn({ title, items }: { title: string, items: string[] }) {
  return (
    <div>
      <h4 className="text-[10px] uppercase tracking-[0.3em] font-bold text-gray-400 mb-8">{title}</h4>
      <ul className="space-y-4">
        {items.map(item => (<li key={item}><a href="#" className="text-sm text-gray-600 hover:text-red-500 transition-colors">{item}</a></li>))}
      </ul>
    </div>
  );
}
