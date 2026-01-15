"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, LogIn, Key, Shield, ArrowRight, Wallet,
  Send, Home, Settings, LogOut, Copy, RefreshCcw,
  Eye, EyeOff, CheckCircle2, ChevronRight, Globe,
  Phone, User, MapPin, Building2, ExternalLink, QrCode,
  Search, Filter, CreditCard, Landmark, Check
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  getBalance,
  getNonce,
  signAndSendTransaction,
  getLatestBlock,
  tokenizeProperty,
  applyForVisa,
  createEscrow,
  releaseEscrow,
  refundEscrow,
  listProperties,
  listEscrows,
  getUserTransactions,
  RPC_URL,
  getRpcUrl,
  setSharedRpcUrl
} from "../lib/blockchain";
import nacl from "tweetnacl";
import { keccak256 } from "js-sha3";

type AppStep = "landing" | "signup" | "mnemonic_show" | "mnemonic_verify" | "login" | "dashboard";

interface Property {
  id: string;
  name: string;
  location: string;
  price: string;
  yield: string;
  landlord: string;
  phone: string;
  description: string;
  image: string;
}

const PROPERTIES: Property[] = [
  {
    id: "prop_1",
    name: "Golden Palace Lisbon",
    location: "Avenida da Liberdade, Lisbon",
    price: "€500,000",
    yield: "5.4%",
    landlord: "Ricardo Silva",
    phone: "+351 912 345 678",
    description: "Ultra-luxury penthouse with panoramic views of the Tagus River. High-performance rental yields with Golden Visa eligibility.",
    image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&q=80&w=800"
  },
  {
    id: "prop_2",
    name: "Azure Porto Heights",
    location: "Ribeira District, Porto",
    price: "€350,000",
    yield: "6.1%",
    landlord: "Maria Fernandez",
    phone: "+351 934 567 890",
    description: "Modern architectural marvel in the heart of Porto's historic district. Includes full property management services.",
    image: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&q=80&w=800"
  },
  {
    id: "prop_3",
    name: "Algarve Beachfront Villa",
    location: "Vilamoura, Algarve",
    price: "€1,200,000",
    yield: "4.2%",
    landlord: "João Pereira",
    phone: "+351 922 888 777",
    description: "Exclusive beachfront property with private access and sustainable energy systems. Top-tier institutional asset.",
    image: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&q=80&w=800"
  }
];

export default function AureumWallet() {
  const [step, setStep] = useState<AppStep>("landing");
  const [password, setPassword] = useState("");
  const [mnemonic, setMnemonic] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("assets");
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [showPK, setShowPK] = useState(false);
  const [rpcServer, setRpcServer] = useState(getRpcUrl());
  const [isSending, setIsSending] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const [isPayingEscrow, setIsPayingEscrow] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [escrowStep, setEscrowStep] = useState<"initial" | "locked" | "completed">("initial");
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [showPKWarning, setShowPKWarning] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [balance, setBalance] = useState("0");
  const [transactions, setTransactions] = useState<any[]>([]);
  const [nonce, setNonce] = useState(0);
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  const [selectedMarket, setSelectedMarket] = useState<string | null>(null);
  const [sendRecipient, setSendRecipient] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendFee, setSendFee] = useState("0.001");
  const [properties, setProperties] = useState<Property[]>([]);
  const [escrows, setEscrows] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isTokenizing, setIsTokenizing] = useState(false);
  const [tokenizeData, setTokenizeData] = useState({ address: "", val: "", meta: "" });
  const [isApplyingVisa, setIsApplyingVisa] = useState(false);
  const [visaData, setVisaData] = useState({ propertyId: "", programIndex: 0 });
  const [currentEscrowId, setCurrentEscrowId] = useState("");

  useEffect(() => {
    const words = "luxury asset golden visa chain property secure investment global portal premium speed liquidity".split(" ");
    setMnemonic(words.sort(() => Math.random() - 0.5).slice(0, 12));

    // Load existing wallet from localStorage if available
    const storedPrivateKey = localStorage.getItem("aureum_wallet_pk");
    if (storedPrivateKey && !walletAddress) {
      loadWalletFromPrivateKey(storedPrivateKey);
    }

    // Initial fetch
    if (step === "dashboard" && walletAddress) {
      fetchWalletData();

      // Auto-refresh every 3 seconds to show real-time updates
      const interval = setInterval(() => {
        fetchWalletData();
      }, 3000);

      return () => clearInterval(interval);
    }
  }, [step, walletAddress]);

  useEffect(() => {
    if (step === "dashboard") {
      const interval = setInterval(fetchWalletData, 5000);
      return () => clearInterval(interval);
    }
  }, [step, walletAddress]);

  const fetchWalletData = async () => {
    try {
      const b = await getBalance(walletAddress);
      setBalance(b.toString());

      const n = await getNonce(walletAddress);
      setNonce(n);

      const props = await listProperties();
      const mappedProps: Property[] = props.map((p: any) => ({
        id: p.id,
        name: p.legal_description.includes(',') ? p.legal_description.split(',')[0] : "Aureum Premium Estate",
        location: p.jurisdiction + (p.legal_description ? `, ${p.legal_description}` : ""),
        price: `${(p.valuation_eur / 1000).toFixed(0)}k AUR`,
        yield: "6.2%", // Default yield for on-chain props
        landlord: p.owner.substring(0, 10) + "...",
        phone: "+351 XXX XXX XXX",
        description: `Tokenized Real Estate Asset on Aureum L1. Valuation: ${p.valuation_eur} EUR. Eligible for Golden Visa.`,
        image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&q=80&w=800" // Default image for demo
      }));
      setProperties([...PROPERTIES, ...mappedProps]);

      const es = await listEscrows();
      setEscrows(es);

      // Fetch user transactions from recent blocks
      const userTxs = await getUserTransactions(walletAddress, 20);
      setTransactions(userTxs);
    } catch (e) {
      console.error("Failed to fetch wallet data", e);
    }
  };

  const handleLogout = () => {
    setStep("landing");
    setPassword("");
    setSelectedProperty(null);
  };

  const handleSaveRpc = () => {
    setSharedRpcUrl(rpcServer);
    alert("RPC Endpoint updated: " + rpcServer);
    fetchWalletData();
  };

  const handleEscrowPay = async () => {
    if (!selectedProperty || !privateKey) return;
    setIsPayingEscrow(true);
    try {
      // Create Escrow with the landlord as the receiver and the user (sender) as the arbiter for demo flexibility
      // In a real scenario, the arbiter would be a 3rd party (e.g. Validator or Legal Firm)
      // Amount is hardcoded to 50,000 AUR for demo
      const hash = await createEscrow(
        walletAddress,
        "A1109cd8305ff4145b0b89495431540d1f4faecdc", // Default Validator/Landlord for demo
        walletAddress, // Self-Arbtered for demo ease
        50000,
        `Purchase of ${selectedProperty.name}`,
        nonce,
        privateKey
      );

      if (hash && hash.startsWith("A") || hash.length > 10) {
        setCurrentEscrowId(hash);
        setEscrowStep("locked");
        fetchWalletData();
        alert("Funds Locked in Escrow! ID: " + hash);
      } else {
        alert("Escrow Failed: " + hash);
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setIsPayingEscrow(false);
    }
  };

  const handleReleaseFunds = async () => {
    if (!currentEscrowId || !privateKey) return;
    setIsPayingEscrow(true);
    try {
      const hash = await releaseEscrow(
        walletAddress,
        currentEscrowId,
        nonce,
        privateKey
      );

      if (hash) {
        setEscrowStep("completed");
        setPaymentSuccess(true);
        setTimeout(() => setPaymentSuccess(false), 3000);
        fetchWalletData();
        alert("Funds Released successfully!");
      }
    } catch (e: any) {
      alert("Release Error: " + e.message);
    } finally {
      setIsPayingEscrow(false);
    }
  };

  const handleExportPK = () => {
    setShowPasswordPrompt(true);
  };

  const handlePasswordSubmit = () => {
    if (passwordInput === password) {
      setShowPasswordPrompt(false);
      setPasswordInput("");
      setShowPKWarning(true);
    } else {
      alert("Incorrect password");
    }
  };

  const generateNewWallet = () => {
    // Generate Ed25519 keypair
    const keypair = nacl.sign.keyPair();
    const privKeyHex = Array.from(keypair.secretKey.slice(0, 32)).map(b => b.toString(16).padStart(2, '0')).join('');
    const pubKeyHex = Array.from(keypair.publicKey).map(b => b.toString(16).padStart(2, '0')).join('');

    // Derive address from public key using Keccak256 (matching node's logic)
    const hash = keccak256(keypair.publicKey);
    const addressSuffix = hash.slice(0, 40); // First 20 bytes (40 hex chars)
    const address = "A" + addressSuffix;

    setPrivateKey(privKeyHex);
    setPublicKey(pubKeyHex);
    setWalletAddress(address);

    // Store private key (INSECURE - for demo only)
    localStorage.setItem("aureum_wallet_pk", privKeyHex);
    localStorage.setItem("aureum_wallet_address", address);
  };

  const loadWalletFromPrivateKey = (pkHex: string) => {
    try {
      const pkBytes = new Uint8Array(pkHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
      const keypair = nacl.sign.keyPair.fromSeed(pkBytes);
      const pubKeyHex = Array.from(keypair.publicKey).map(b => b.toString(16).padStart(2, '0')).join('');

      const hash = keccak256(keypair.publicKey);
      const addressSuffix = hash.slice(0, 40);
      const address = "A" + addressSuffix;

      setPrivateKey(pkHex);
      setPublicKey(pubKeyHex);
      setWalletAddress(address);
    } catch (e) {
      console.error("Failed to load wallet", e);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      // Try Clipboard API first (HTTPS only)
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        alert("Copied to clipboard!");
        return;
      }
      // Throw to trigger fallback
      throw new Error("Clipboard API unavailable");
    } catch (e) {
      // Fallback for HTTP/non-HTTPS environments
      try {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);

        if (successful) {
          alert("Copied to clipboard!");
        } else {
          console.error("execCommand failed");
          alert("Clipboard blocked. Please copy manually: " + text);
        }
      } catch (err) {
        console.error("Fallback error", err);
        alert("Failed to copy. Please copy manually: " + text);
      }
    }
  };

  const handleTokenize = async () => {
    if (!tokenizeData.address || !tokenizeData.val || !privateKey) return;
    setIsProcessing(true);
    try {
      const hash = await tokenizeProperty(
        walletAddress,
        tokenizeData.address,
        parseFloat(tokenizeData.val),
        tokenizeData.meta || "Bespoke Asset",
        nonce,
        privateKey
      );
      if (hash && (hash.startsWith("A") || hash.length > 10)) {
        alert("Property Tokenized Successfully! Asset ID: " + hash);
        setIsTokenizing(false);
        setTokenizeData({ address: "", val: "", meta: "" });
        fetchWalletData();
      } else {
        alert("Tokenization Failed: " + hash);
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSend = async () => {
    if (!sendRecipient || !sendAmount || !privateKey) return;
    setIsProcessing(true);
    try {
      const hash = await signAndSendTransaction(
        walletAddress,
        sendRecipient,
        parseFloat(sendAmount),
        nonce,
        parseFloat(sendFee),
        privateKey
      );
      if (hash && hash.startsWith("A")) {
        alert("Transaction Successful! Hash: " + hash);
        setIsSending(false);
        setIsReviewing(false);
        setSendRecipient("");
        setSendAmount("");
        fetchWalletData();
      } else {
        alert("Transaction Failed: " + hash);
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApplyForVisa = async () => {
    if (!visaData.propertyId || !privateKey) {
      alert("Please enter a valid Property ID");
      return;
    }
    setIsProcessing(true);
    try {
      const hash = await applyForVisa(
        walletAddress,
        visaData.propertyId,
        visaData.programIndex,
        500000, // Standard min investment
        nonce,
        privateKey
      );
      if (hash && hash.startsWith("A")) {
        alert("Visa Application Submitted! Application Hash: " + hash);
        setIsApplyingVisa(false);
        setSelectedMarket(null);
        setVisaData({ propertyId: "", programIndex: 0 });
        fetchWalletData();
      } else {
        alert("Application Failed: " + hash);
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col font-inter mesh-gradient">
      <AnimatePresence mode="wait">
        {/* LANDING PAGE */}
        {step === "landing" && (
          <motion.div
            key="landing"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
            className="flex-1 flex flex-col items-center justify-center p-8 text-center"
          >
            <div className="mb-10 relative">
              <motion.div
                animate={{ rotate: 360 }} transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 bg-red-600/20 blur-[60px] rounded-full scale-150"
              />
              <img src="/assets/logo.png" alt="Aureum Logo" className="w-24 h-24 relative z-10" />
            </div>
            <h1 className="text-6xl font-bold mb-4 tracking-tighter shimmer-text">AUREUM</h1>
            <p className="text-gray-400 mb-12 tracking-[0.4em] text-xs uppercase font-medium">Bespoke Real Estate Blockchain</p>

            <div className="w-full max-w-sm space-y-4">
              <button
                onClick={() => { generateNewWallet(); setStep("signup"); }}
                className="btn-primary w-full py-5 text-base"
              >
                Create New Wallet
              </button>
              <button
                onClick={() => setStep("login")}
                className="btn-outline w-full py-5 text-base"
              >
                Login with Password
              </button>
              <button
                onClick={() => { setStep("login"); setShowPasswordPrompt(true); }}
                className="text-[10px] uppercase tracking-[0.4em] text-gray-600 font-bold hover:text-white transition-colors mt-8"
              >
                — or import secure key —
              </button>
            </div>
          </motion.div>
        )}

        {/* SIGNUP FLOW */}
        {step === "signup" && (
          <motion.div
            key="signup"
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
            className="flex-1 flex flex-col items-center justify-center p-6"
          >
            <div className="w-full max-w-md core-card p-10 glass-panel">
              <h2 className="text-3xl font-bold mb-4 font-premium">Set Security Key</h2>
              <p className="text-gray-400 text-sm mb-10 leading-relaxed">This password will be used to unlock your wallet on this machine. Aureum does not store your password.</p>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-bold">Secure Password</label>
                  <input
                    type="password"
                    className="input-field"
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-bold">Verify Password</label>
                  <input type="password" placeholder="••••••••••••" className="input-field" />
                </div>
                <button
                  onClick={() => setStep("mnemonic_show")}
                  disabled={password.length < 8}
                  className="btn-primary w-full mt-4 disabled:opacity-30 transition-all"
                >
                  Confirm & Initialize
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* MNEMONIC SHOW */}
        {step === "mnemonic_show" && (
          <motion.div
            key="mnemonic"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex-1 flex flex-col items-center justify-center p-6"
          >
            <div className="w-full max-w-xl core-card p-10 glass-panel">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-full bg-red-600/10 flex items-center justify-center">
                  <Shield className="text-red-500" />
                </div>
                <h2 className="text-3xl font-bold font-premium">Recovery Phrase</h2>
              </div>
              <p className="text-gray-400 text-sm mb-10 leading-relaxed italic">Write these words down on a physical paper. Do not take a screenshot. This is your <span className="text-white font-bold">Universal Key</span> to all your real estate assets.</p>

              <div className="grid grid-cols-3 gap-4 mb-10">
                {mnemonic.map((word, i) => (
                  <div key={i} className="mnemonic-chip flex items-center gap-3 py-4 border border-white/5 bg-white/5 rounded-xl">
                    <span className="text-[10px] text-gray-600 font-bold">{i + 1}</span> {word}
                  </div>
                ))}
              </div>

              <div className="flex gap-4">
                <button onClick={() => copyToClipboard(mnemonic.join(' '))} className="btn-outline flex-1 gap-2"><Copy size={16} /> Copy All</button>
                <button
                  onClick={() => setStep("dashboard")}
                  className="btn-primary flex-1"
                >
                  Access Dashboard
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* LOGIN PAGE */}
        {step === "login" && (
          <motion.div
            key="login"
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="flex-1 flex flex-col items-center justify-center p-6"
          >
            <div className="w-full max-w-md core-card p-10 glass-panel">
              <div className="flex flex-col items-center mb-10">
                <img src="/assets/logo.png" alt="Aureum" className="w-16 h-16 mb-4" />
                <h2 className="text-3xl font-bold font-premium tracking-tighter">Welcome Back</h2>
                <p className="text-gray-500 text-sm italic">Unlock your secure vault</p>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-bold">Safe Password</label>
                  <input
                    type="password"
                    className="input-field"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (passwordInput === password || password === "" ? setStep("dashboard") : alert("Invalid password"))}
                    placeholder="••••••••••••"
                    autoFocus
                  />
                </div>
                <button
                  onClick={() => {
                    if (passwordInput === password || password === "") {
                      setStep("dashboard");
                      setPasswordInput("");
                    } else {
                      alert("Invalid password");
                    }
                  }}
                  className="btn-primary w-full py-4"
                >
                  Unlock Wallet
                </button>
                <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-gray-500 pt-4 border-t border-white/5">
                  <button onClick={() => {
                    const pk = prompt("Enter your 64-character Private Key hex:");
                    if (pk && pk.length === 64) {
                      loadWalletFromPrivateKey(pk);
                      localStorage.setItem("aureum_wallet_pk", pk);
                      alert("Key imported successfully. Now set a password or login.");
                    } else if (pk) {
                      alert("Invalid Key length. Must be 64 hex characters.");
                    }
                  }} className="hover:text-red-500 transition-colors">Import Key</button>
                  <button onClick={() => setStep("landing")} className="hover:text-white transition-colors">Back</button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* DASHBOARD */}
        {step === "dashboard" && (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex-1 flex"
          >
            {/* Sidebar */}
            <aside className="w-72 border-r border-white/5 flex flex-col p-8 glass-panel sticky top-0 h-screen">
              <div className="flex items-center gap-4 mb-16">
                <img src="/assets/logo.png" alt="Aureum" className="w-10 h-10" />
                <h1 className="font-bold tracking-tighter text-2xl font-premium">AUREUM</h1>
              </div>

              <nav className="flex-1 space-y-3">
                <SidebarItem icon={<Wallet size={20} />} label="Portfolio" active={activeTab === "assets"} onClick={() => setActiveTab("assets")} />
                <SidebarItem icon={<Home size={20} />} label="Real Estate" active={activeTab === "real-estate"} onClick={() => setActiveTab("real-estate")} />
                <SidebarItem icon={<Shield size={20} />} label="Escrows" active={activeTab === "escrows"} onClick={() => setActiveTab("escrows")} />
                <SidebarItem icon={<Globe size={20} />} label="Markets" active={activeTab === "markets"} onClick={() => setActiveTab("markets")} />
                <SidebarItem icon={<Settings size={20} />} label="Settings" active={activeTab === "settings"} onClick={() => setActiveTab("settings")} />
              </nav>

              <div className="mt-auto space-y-6">
                <div className="p-4 core-card bg-red-600/5 border-red-500/10">
                  <div className="text-[10px] text-red-500 font-bold uppercase mb-1">Network Status</div>
                  <div className="text-xs font-bold text-gray-400">Mainnet v0.1.0 ({walletAddress.startsWith('A') ? 'A-standard' : 'Legacy'})</div>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-4 text-gray-500 hover:text-red-500 transition-all p-2 group"
                >
                  <LogOut size={18} className="group-hover:-translate-x-1 transition-transform" /> <span className="text-sm font-bold uppercase tracking-[0.2em] transition-transform">Logout</span>
                </button>
              </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 p-10 overflow-y-auto bg-black/40">
              {activeTab === "assets" && (
                <div className="max-w-5xl mx-auto">
                  {/* Hero Balance Section */}
                  <div className="relative mb-16 p-12 core-card glass-panel overflow-hidden">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-red-600/10 blur-[100px] -mr-48 -mt-48 rounded-full"></div>
                    <h2 className="text-xs uppercase tracking-[0.4em] text-gray-500 mb-4 font-bold">Total Asset Valuation</h2>
                    <h1 className="text-7xl font-bold mb-6 font-premium tracking-tighter flex items-start gap-2">
                      <span className="text-2xl mt-3 mr-2 font-medium opacity-50">AUR</span> {Number(balance).toLocaleString()}<span className="text-red-500">.00</span>
                    </h1>
                    <div className="flex gap-6 mb-8">
                      <div className="flex items-center gap-2 text-emerald-500 text-sm font-bold">
                        <Plus size={16} /> +€12,400 (Last 30d)
                      </div>
                    </div>
                    {/* Wallet Address Display */}
                    <div className="p-4 bg-white/5 rounded-xl border border-white/5 flex items-center justify-between">
                      <div>
                        <div className="text-[10px] uppercase text-gray-500 font-bold mb-1 tracking-widest">Your Wallet Address</div>
                        <div className="font-mono text-sm text-gray-300">{walletAddress.substring(0, 12)}...{walletAddress.substring(walletAddress.length - 8)}</div>
                      </div>
                      <button onClick={() => copyToClipboard(walletAddress)} className="text-red-500 hover:text-red-400 transition-all p-2 hover:bg-red-500/10 rounded-lg">
                        <Copy size={18} />
                      </button>
                    </div>
                  </div>

                  {/* Actions Row */}
                  <div className="grid grid-cols-2 gap-6 mb-16">
                    <button
                      onClick={() => setIsSending(true)}
                      className="p-8 core-card flex flex-col items-center justify-center gap-4 hover:border-red-500/40 group transition-all"
                    >
                      <div className="w-14 h-14 rounded-full bg-red-600/10 flex items-center justify-center group-hover:bg-red-600 group-hover:text-white transition-all text-red-500">
                        <Send size={28} />
                      </div>
                      <span className="text-sm font-bold uppercase tracking-[0.2em]">Send Assets</span>
                    </button>
                    <button
                      onClick={() => setIsReceiving(true)}
                      className="p-8 core-card flex flex-col items-center justify-center gap-4 hover:border-white/20 transition-all"
                    >
                      <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center text-white">
                        <RefreshCcw size={28} />
                      </div>
                      <span className="text-sm font-bold uppercase tracking-[0.2em]">Receive Assets</span>
                    </button>
                  </div>

                  <div className="space-y-4 mb-16">
                    <h3 className="text-[10px] uppercase tracking-[0.4em] text-gray-500 font-bold mb-4">Currency Vault</h3>
                    {Number(balance) > 0 ? (
                      <AssetRow symbol="AUR" name="Aureum Governance" balance={Number(balance).toLocaleString()} value={`€${(Number(balance) * 2).toLocaleString()}`} />
                    ) : (
                      <div className="text-center py-20 border-2 border-dashed border-white/5 rounded-3xl group hover:border-red-500/20 transition-all">
                        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4 text-gray-600 group-hover:bg-red-500/10 group-hover:text-red-500 transition-all">
                          <Plus size={24} />
                        </div>
                        <p className="text-gray-600 group-hover:text-gray-400 transition-all font-bold uppercase tracking-widest text-[10px]">No core assets in vault</p>
                      </div>
                    )}
                  </div>

                  {/* Transaction History */}
                  <div className="space-y-4">
                    <div className="flex justify-between items-end mb-6">
                      <h3 className="text-[10px] uppercase tracking-[0.4em] text-gray-500 font-bold">Recent Transactions</h3>
                      <button onClick={() => setShowAllTransactions(true)} className="text-[10px] font-bold text-red-500 uppercase tracking-widest hover:text-white transition-colors">View All Transactions</button>
                    </div>
                    {transactions.length > 0 ? transactions.map((tx, i) => (
                      <TransactionRow
                        key={i}
                        type={tx.sender === walletAddress ? "sent" : "received"}
                        from={tx.sender}
                        to={tx.receiver}
                        amount={(tx.sender === walletAddress ? "-" : "+") + tx.amount + " AUR"}
                        date={`Block #${tx.blockHeight}`}
                        status="confirmed"
                      />
                    )) : (
                      <div className="text-center py-10 text-gray-600 font-bold uppercase italic tracking-widest bg-white/5 rounded-2xl">No Recent Activity on Chain</div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "real-estate" && !selectedProperty && (
                <div className="max-w-6xl mx-auto">
                  <div className="flex justify-between items-end mb-12">
                    <div>
                      <h2 className="text-xs uppercase tracking-[0.4em] text-gray-500 mb-2 font-bold">Inventory</h2>
                      <h1 className="text-5xl font-bold font-premium tracking-tighter italic">Bespoke Listings</h1>
                    </div>
                    <div className="flex gap-4">
                      <button
                        onClick={() => setIsTokenizing(true)}
                        className="btn-primary py-2 px-6 flex items-center gap-2 text-xs"
                      >
                        <Plus size={16} /> Tokenize Asset
                      </button>
                      <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" size={16} />
                        <input placeholder="Filter location..." className="bg-[#121212] border border-white/5 py-3 pl-12 pr-6 rounded-xl text-sm outline-none focus:border-red-500" />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-10">
                    {properties.map(prop => (
                      <div key={prop.id} onClick={() => setSelectedProperty(prop)} className="cursor-pointer group">
                        <div className="relative h-80 rounded-3xl overflow-hidden mb-6">
                          <img src={prop.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                          <div className="absolute top-6 right-6 glass-panel py-2 px-4 rounded-full text-xs font-bold text-emerald-400">
                            {prop.yield} Annual Yield
                          </div>
                          <div className="absolute bottom-6 left-6">
                            <div className="text-sm text-gray-300 mb-1 flex items-center gap-1"><MapPin size={12} /> {prop.location}</div>
                            <h3 className="text-2xl font-bold font-premium">{prop.name}</h3>
                          </div>
                        </div>
                        <div className="flex justify-between items-center px-2">
                          <div className="text-3xl font-bold font-premium">{prop.price}</div>
                          <div className="text-red-500 flex items-center gap-2 font-bold text-sm tracking-widest uppercase group-hover:gap-4 transition-all">
                            Inspect Property <ChevronRight size={18} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "real-estate" && selectedProperty && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto">
                  <button onClick={() => { setSelectedProperty(null); setEscrowStep("initial"); }} className="mb-10 flex items-center gap-2 text-gray-500 hover:text-white group">
                    <ArrowRight className="rotate-180 group-hover:-translate-x-1 transition-transform" /> Back to Market
                  </button>

                  <div className="grid grid-cols-12 gap-10 mb-20">
                    <div className="col-span-12 lg:col-span-7">
                      <div className="h-[450px] rounded-3xl overflow-hidden mb-8 border border-white/5">
                        <img src={selectedProperty.image} className="w-full h-full object-cover" />
                      </div>
                      <h1 className="text-5xl font-bold mb-4 font-premium tracking-tighter">{selectedProperty.name}</h1>
                      <p className="text-gray-400 leading-relaxed text-lg mb-10">{selectedProperty.description}</p>

                      <div className="grid grid-cols-2 gap-6">
                        <div className="p-6 core-card space-y-2">
                          <div className="text-[10px] uppercase text-gray-500 font-bold tracking-[0.2em]">Target Region</div>
                          <div className="text-xl font-bold">{selectedProperty.location}</div>
                        </div>
                        <div className="p-6 core-card space-y-2">
                          <div className="text-[10px] uppercase text-gray-500 font-bold tracking-[0.2em]">Asset Standard</div>
                          <div className="text-xl font-bold text-red-500">ERC-1155 AUR Hybrid</div>
                        </div>
                      </div>
                    </div>

                    <div className="col-span-12 lg:col-span-5">
                      <div className="core-card glass-panel p-8 sticky top-10 border-red-500/20">
                        <h3 className="text-sm font-bold uppercase tracking-[0.3em] text-gray-400 mb-8 pb-4 border-b border-white/5">Asset Lifecycle</h3>

                        <div className="space-y-8 mb-12">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center">
                              <User className="text-red-500" />
                            </div>
                            <div>
                              <div className="text-[10px] uppercase text-gray-500 font-bold">Landlord / GP</div>
                              <div className="text-lg font-bold">{selectedProperty.landlord}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center">
                              <Phone className="text-gold" />
                            </div>
                            <div>
                              <div className="text-[10px] uppercase text-gray-500 font-bold">Authorization Line</div>
                              <div className="text-lg font-bold">{selectedProperty.phone}</div>
                            </div>
                          </div>
                        </div>

                        <div className="p-6 bg-white/5 rounded-2xl mb-10 text-center">
                          <div className="text-[10px] uppercase text-gray-500 font-bold mb-1 tracking-[0.2em]">Listing Price</div>
                          <div className="text-5xl font-bold font-premium text-red-500">{selectedProperty.price}</div>
                        </div>

                        <div className="space-y-4">
                          {escrowStep === "initial" && (
                            <button
                              onClick={handleEscrowPay}
                              disabled={isPayingEscrow}
                              className="w-full btn-primary py-6 text-lg relative overflow-hidden flex items-center justify-center gap-3"
                            >
                              {isPayingEscrow ? (
                                <>
                                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}><RefreshCcw /></motion.div>
                                  <span>Locking Funds...</span>
                                </>
                              ) : (
                                "Lock Funds in Escrow"
                              )}
                            </button>
                          )}

                          {escrowStep === "locked" && (
                            <div className="space-y-4 animate-in fade-in zoom-in duration-300">
                              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center">
                                <div className="text-emerald-500 font-bold uppercase tracking-widest text-xs mb-1">Funds Secured</div>
                                <div className="text-white font-premium font-bold italic">50,000 AUR Locked</div>
                              </div>
                              <button
                                onClick={handleReleaseFunds}
                                disabled={isPayingEscrow}
                                className="w-full bg-white text-black font-bold py-6 text-lg uppercase tracking-widest hover:bg-gray-200 transition-colors rounded-xl flex items-center justify-center gap-3"
                              >
                                {isPayingEscrow ? (
                                  <>
                                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}><RefreshCcw size={20} /></motion.div>
                                    <span>Releasing...</span>
                                  </>
                                ) : "Release to Landlord"}
                              </button>
                            </div>
                          )}

                          {escrowStep === "completed" && (
                            <div className="p-6 bg-emerald-600 text-white rounded-xl text-center animate-in fade-in zoom-in">
                              <CheckCircle2 size={40} className="mx-auto mb-3" />
                              <div className="font-bold font-premium text-2xl italic mb-1">Deal Finalized</div>
                              <div className="text-xs uppercase tracking-widest opacity-80">Title Transfer Initiated</div>
                            </div>
                          )}
                        </div>
                        <p className="mt-4 text-[10px] text-center text-gray-500 uppercase tracking-tighter">
                          {escrowStep === "initial" ? "Funds are locked in AUR-ESCROW-V1 contract until approval." :
                            escrowStep === "locked" ? "Waiting for final inspection and approval." : "Transaction recorded on chain."}
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === "escrows" && (
                <div className="max-w-5xl mx-auto">
                  <div className="flex justify-between items-end mb-12">
                    <div>
                      <h2 className="text-xs uppercase tracking-[0.4em] text-gray-500 mb-2 font-bold">Escrow management</h2>
                      <h1 className="text-5xl font-bold font-premium tracking-tighter italic">Active Agreements</h1>
                    </div>
                  </div>

                  <div className="space-y-6">
                    {escrows.length > 0 ? escrows.filter(e => e.sender === walletAddress || e.receiver === walletAddress || e.arbiter === walletAddress).map((escrow, i) => (
                      <div key={i} className="core-card p-8 glass-panel border-white/5 relative overflow-hidden">
                        <div className="flex justify-between items-start mb-6">
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <Shield className="text-red-500" size={16} />
                              <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Escrow #{escrow.id.substring(0, 8)}</span>
                            </div>
                            <h3 className="text-2xl font-bold font-premium">{escrow.amount.toLocaleString()} AUR</h3>
                            <p className="text-gray-500 text-sm mt-1">{escrow.conditions}</p>
                          </div>
                          <div className={`px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${escrow.status === "Pending" ? "bg-amber-500/10 text-amber-500" :
                            escrow.status === "Released" ? "bg-emerald-500/10 text-emerald-500" :
                              "bg-red-500/10 text-red-500"
                            }`}>
                            {escrow.status}
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-6 mb-8 py-6 border-y border-white/5">
                          <div>
                            <div className="text-[10px] uppercase text-gray-500 font-bold mb-1">Sender</div>
                            <div className="text-xs font-mono text-gray-300">{escrow.sender.substring(0, 10)}...</div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase text-gray-500 font-bold mb-1">Receiver</div>
                            <div className="text-xs font-mono text-gray-300">{escrow.receiver.substring(0, 10)}...</div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase text-gray-500 font-bold mb-1">Arbiter</div>
                            <div className="text-xs font-mono text-gray-300">{escrow.arbiter.substring(0, 10)}...</div>
                          </div>
                        </div>

                        {escrow.status === "Pending" && (
                          <div className="flex gap-4">
                            {(walletAddress === escrow.sender || walletAddress === escrow.arbiter) && (
                              <button
                                onClick={async () => {
                                  setIsProcessing(true);
                                  try {
                                    await releaseEscrow(walletAddress, escrow.id, nonce, privateKey);
                                    alert("Funds released successfully!");
                                    fetchWalletData();
                                  } catch (e) {
                                    alert("Failed to release funds: " + e);
                                  }
                                  setIsProcessing(false);
                                }}
                                disabled={isProcessing}
                                className="btn-primary py-3 px-8 text-xs flex-1"
                              >
                                Release Funds
                              </button>
                            )}
                            {walletAddress === escrow.arbiter && (
                              <button
                                className="btn-outline py-3 px-8 text-xs flex-1"
                                onClick={async () => {
                                  setIsProcessing(true);
                                  try {
                                    await refundEscrow(walletAddress, escrow.id, nonce, privateKey);
                                    alert("Refund initiated successfully!");
                                    fetchWalletData();
                                  } catch (e) {
                                    alert("Failed to refund: " + e);
                                  }
                                  setIsProcessing(false);
                                }}
                                disabled={isProcessing}
                              >
                                Request Refund
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )) : (
                      <div className="text-center py-20 border-2 border-dashed border-white/5 rounded-3xl">
                        <Shield className="mx-auto text-gray-700 mb-4" size={48} />
                        <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">No active escrows found</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "markets" && (
                <div className="max-w-6xl mx-auto">
                  <h2 className="text-xs uppercase tracking-[0.4em] text-gray-500 mb-2 font-bold uppercase tracking-[0.2em]">Ecosystem Expansion</h2>
                  <h1 className="text-5xl font-bold font-premium tracking-tighter italic mb-16">Global Private Markets</h1>

                  <div className="grid grid-cols-3 gap-8">
                    <MarketTile onClick={() => setSelectedMarket("Commercial REITs")} icon={<Building2 />} title="Commercial REITs" description="Bespoke institutional office and retail portfolios." stats="12 Projects • 8.4% APY" />
                    <MarketTile onClick={() => setSelectedMarket("Visa Programs")} icon={<Landmark />} title="Visa Programs" description="Portugal, Greece, and Dubai investment compliance." stats="Fully Compliant • +2,400 Users" />
                    <MarketTile onClick={() => setSelectedMarket("Aureum Debt")} icon={<CreditCard />} title="Aureum Debt" description="Securitized real estate loans and yield engines." stats="Liquidity: €450M" />
                  </div>
                </div>
              )}

              {activeTab === "settings" && (
                <div className="max-w-2xl mx-auto">
                  <h2 className="text-4xl font-bold mb-16 font-premium italic text-red-500">System Architecture</h2>

                  <div className="space-y-12">
                    <section>
                      <h3 className="text-xs uppercase text-gray-400 font-bold tracking-[0.2em] mb-6">Network Node Configuration</h3>
                      <div className="core-card p-10 glass-panel border-white/5">
                        <div className="space-y-6">
                          <div>
                            <label className="text-[10px] uppercase text-gray-500 font-bold mb-3 block tracking-widest">RPC Endpoint URL</label>
                            <div className="flex gap-4">
                              <input
                                value={rpcServer}
                                onChange={(e) => setRpcServer(e.target.value)}
                                className="input-field flex-1 font-mono text-sm py-4 px-6"
                                placeholder="http://139.59.214.243:8545"
                              />
                              <button
                                onClick={handleSaveRpc}
                                className="btn-primary py-4 px-10 text-xs font-bold uppercase tracking-widest"
                              >
                                Apply
                              </button>
                            </div>
                            <p className="text-[10px] text-gray-600 mt-4 leading-relaxed font-premium italic">
                              Connected to: {getRpcUrl()} • Changes persist in local storage.
                            </p>
                          </div>
                        </div>
                      </div>
                    </section>

                    <section>
                      <h3 className="text-xs uppercase text-gray-400 font-bold tracking-[0.2em] mb-6">Security & Recovery</h3>
                      <div className="space-y-4">
                        <div className="p-6 core-card glass-panel border-white/5 flex justify-between items-center group hover:border-white/10 transition-all">
                          <div>
                            <div className="font-bold text-gray-200 mb-1">Export Private Key</div>
                            <div className="text-xs text-gray-500 italic">Emergency backup for external signing</div>
                          </div>
                          <button onClick={handleExportPK} className="btn-outline py-2 px-8 text-[10px] uppercase font-bold tracking-widest">Export</button>
                        </div>
                        <button className="w-full btn-outline py-5 text-[10px] font-black tracking-[0.2em] uppercase transition-all hover:bg-red-600/10 hover:border-red-500/40">Modify Safety Password</button>
                      </div>
                    </section>
                  </div>
                </div>
              )}
            </main>
          </motion.div>
        )}
      </AnimatePresence>

      {/* OVERLAYS */}
      <AnimatePresence>
        {isReceiving && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-6"
          >
            <div className="max-w-md w-full core-card p-10 glass-panel border-white/10 text-center">
              <h3 className="text-2xl font-bold mb-2 font-premium tracking-tighter">Receive Core Assets</h3>
              <p className="text-gray-500 text-sm mb-10">Scan to initiate a secure transfer to your Aureum vault.</p>

              <div className="bg-white p-6 rounded-3xl inline-block mb-10 shadow-[0_0_50px_rgba(255,255,255,0.1)]">
                <QRCodeSVG value={walletAddress} size={240} fgColor="#000000" />
              </div>

              <div className="p-4 bg-white/5 rounded-xl border border-white/5 flex items-center justify-between mb-10">
                <span className="font-mono text-xs text-gray-400">{walletAddress.substring(0, 8)}...{walletAddress.substring(walletAddress.length - 6)}</span>
                <button onClick={() => copyToClipboard(walletAddress)} className="text-red-500"><Copy size={16} /></button>
              </div>

              <button onClick={() => setIsReceiving(false)} className="btn-primary w-full">Done</button>
            </div>
          </motion.div>
        )}

        {isTokenizing && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-6"
          >
            <div className="max-w-lg w-full core-card p-10 glass-panel border-white/10">
              <h3 className="text-2xl font-bold mb-2 font-premium tracking-tighter">Tokenize Physical Asset</h3>
              <p className="text-gray-500 text-sm mb-10">Register a new property to the Aureum Immutable Ledger.</p>

              <div className="space-y-6 mb-10">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase text-gray-500 font-bold tracking-widest">Physical Address</label>
                  <input
                    placeholder="e.g. 123 Luxury Ave, Lisbon"
                    className="input-field"
                    value={tokenizeData.address}
                    onChange={(e) => setTokenizeData({ ...tokenizeData, address: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase text-gray-500 font-bold tracking-widest">Valuation (AUR)</label>
                    <input
                      placeholder="500,000"
                      className="input-field"
                      type="number"
                      value={tokenizeData.val}
                      onChange={(e) => setTokenizeData({ ...tokenizeData, val: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase text-gray-500 font-bold tracking-widest">Jurisdiction</label>
                    <select className="input-field bg-black text-white outline-none appearance-none">
                      <option>Portugal (Golden Visa)</option>
                      <option>UAE (Dubai Marina)</option>
                      <option>UK (London Mayfair)</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase text-gray-500 font-bold tracking-widest">Metadata / Legal Link</label>
                  <input
                    placeholder="https://ipfs.io/ipfs/..."
                    className="input-field"
                    value={tokenizeData.meta}
                    onChange={(e) => setTokenizeData({ ...tokenizeData, meta: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex gap-4">
                <button onClick={() => setIsTokenizing(false)} className="btn-outline flex-1">Abort</button>
                <button
                  onClick={handleTokenize}
                  className="btn-primary flex-1"
                  disabled={isProcessing}
                >
                  {isProcessing ? "Finalizing..." : "Mint Asset NFT"}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {isSending && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-6"
          >
            <div className="max-w-lg w-full core-card p-10 glass-panel border-white/10">
              {!isReviewing ? (
                <>
                  <h3 className="text-2xl font-bold mb-2 font-premium tracking-tighter">Dispatch Assets</h3>
                  <p className="text-gray-500 text-sm mb-10">Transfer AUR tokens to another wallet address on the Aureum network.</p>

                  <div className="space-y-6 mb-10">
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase text-gray-500 font-bold tracking-widest">Recipient Address</label>
                      <input placeholder="A..." className="input-field font-mono" value={sendRecipient} onChange={(e) => setSendRecipient(e.target.value)} />
                      <p className="text-[10px] text-gray-600 mt-1">Enter valid Aureum address starting with 'A'</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase text-gray-500 font-bold tracking-widest">Amount (AUR)</label>
                        <input placeholder="0.00" className="input-field" type="number" step="0.01" value={sendAmount} onChange={(e) => setSendAmount(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase text-gray-500 font-bold tracking-widest">Gas Fee (Auto)</label>
                        <input className="input-field text-gray-500 cursor-not-allowed" type="text" value={sendFee} disabled />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase text-gray-500 font-bold tracking-widest">Transaction Note (Optional)</label>
                      <textarea placeholder="Add a private note for this transaction..." className="input-field resize-none" rows={3}></textarea>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <button onClick={() => setIsSending(false)} className="btn-outline flex-1">Abort</button>
                    <button
                      onClick={() => {
                        if (sendRecipient && sendAmount) setIsReviewing(true);
                        else alert("Please fill in all fields");
                      }}
                      className="btn-primary flex-1"
                    >
                      Review Transfer
                    </button>
                  </div>
                </>
              ) : (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                  <h3 className="text-2xl font-bold mb-2 font-premium tracking-tighter">Confirm Dispatch</h3>
                  <p className="text-gray-500 text-sm mb-8">Please review the transaction details carefully before signing.</p>

                  <div className="p-6 bg-white/5 rounded-2xl border border-white/5 space-y-4 mb-8">
                    <div className="flex justify-between items-center pb-4 border-b border-white/5">
                      <span className="text-xs text-gray-400 uppercase tracking-widest">Recipient</span>
                      <span className="text-sm font-mono text-white break-all text-right w-1/2">{sendRecipient}</span>
                    </div>
                    <div className="flex justify-between items-center pb-4 border-b border-white/5">
                      <span className="text-xs text-gray-400 uppercase tracking-widest">Amount</span>
                      <span className="text-xl font-bold font-premium text-white">{sendAmount} AUR</span>
                    </div>
                    <div className="flex justify-between items-center pb-4 border-b border-white/5">
                      <span className="text-xs text-gray-400 uppercase tracking-widest">Network Fee</span>
                      <span className="text-sm font-bold text-gray-400">{sendFee} AUR</span>
                    </div>
                    <div className="flex justify-between items-center pt-2">
                      <span className="text-xs text-red-500 uppercase tracking-widest font-bold">Total Debit</span>
                      <span className="text-2xl font-bold font-premium text-red-500">{(parseFloat(sendAmount || "0") + parseFloat(sendFee)).toFixed(4)} AUR</span>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <button onClick={() => setIsReviewing(false)} className="btn-outline flex-1">Back</button>
                    <button onClick={handleSend} disabled={isProcessing} className="btn-primary flex-1">
                      {isProcessing ? "Processing..." : "Confirm & Sign"}
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}

        {showPasswordPrompt && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-6"
          >
            <div className="max-w-md w-full core-card p-10 glass-panel border-red-500/20">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-full bg-red-600/10 flex items-center justify-center">
                  <Shield className="text-red-500" size={24} />
                </div>
                <h3 className="text-2xl font-bold font-premium tracking-tighter">Authentication Required</h3>
              </div>
              <p className="text-gray-400 text-sm mb-8">Enter your wallet password to view your private key.</p>

              <div className="space-y-6 mb-8">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase text-gray-500 font-bold tracking-widest">Password</label>
                  <input
                    type="password"
                    className="input-field"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handlePasswordSubmit()}
                    placeholder="••••••••••••"
                    autoFocus
                  />
                </div>
              </div>

              <div className="flex gap-4">
                <button onClick={() => { setShowPasswordPrompt(false); setPasswordInput(""); }} className="btn-outline flex-1">Cancel</button>
                <button onClick={handlePasswordSubmit} className="btn-primary flex-1">Unlock</button>
              </div>
            </div>
          </motion.div>
        )}

        {showPKWarning && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-6"
          >
            <div className="max-w-lg w-full core-card p-10 glass-panel border-red-500/20">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 rounded-full bg-red-600/20 flex items-center justify-center animate-pulse">
                  <Shield className="text-red-500" size={28} />
                </div>
                <h3 className="text-3xl font-bold font-premium tracking-tighter text-red-500">SECURITY WARNING</h3>
              </div>

              <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-2xl mb-8">
                <p className="text-sm leading-relaxed mb-4 font-bold text-red-400">⚠️ NEVER share your private key with anyone!</p>
                <ul className="text-xs text-gray-400 space-y-2 leading-relaxed">
                  <li>• Anyone with access to this key can steal ALL your assets</li>
                  <li>• Aureum support will NEVER ask for your private key</li>
                  <li>• Do not enter this key on websites or share via email/messages</li>
                  <li>• Store this in a secure, offline location only</li>
                </ul>
              </div>

              {showPK && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
                  <label className="text-[10px] uppercase text-gray-500 font-bold tracking-widest mb-2 block">Your Private Key</label>
                  <div className="p-4 bg-black/60 border border-red-500/20 rounded-xl font-mono text-[11px] break-all leading-loose text-red-200 select-all">
                    {privateKey}
                  </div>
                </motion.div>
              )}

              <div className="flex gap-4">
                <button onClick={() => { setShowPKWarning(false); setShowPK(false); }} className="btn-outline flex-1">Close & Hide</button>
                <button onClick={() => setShowPK(!showPK)} className="btn-primary flex-1">
                  {showPK ? "Hide Key" : "Reveal Key"}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {showAllTransactions && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-6"
          >
            <div className="max-w-4xl w-full core-card p-10 glass-panel border-white/10 flex flex-col max-h-[90vh]">
              <div className="flex justify-between items-center mb-10">
                <h3 className="text-3xl font-bold font-premium tracking-tighter italic">Ledger Explorer</h3>
                <button onClick={() => setShowAllTransactions(false)} className="btn-outline px-6 py-2">Close Explorer</button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 pr-4 custom-scrollbar">
                {transactions.length > 0 ? transactions.map((tx: any, i) => (
                  <TransactionRow
                    key={i}
                    type={tx.sender === walletAddress ? "sent" : "received"}
                    from={tx.sender}
                    to={tx.receiver}
                    amount={(tx.sender === walletAddress ? "-" : "+") + tx.amount + " AUR"}
                    date={`Block #${tx.blockHeight}`}
                    status="confirmed"
                  />
                )) : (
                  <div className="text-center py-20 text-gray-500 font-bold uppercase tracking-widest">No history found on chain</div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {selectedMarket && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-6"
          >
            <div className="max-w-2xl w-full core-card p-12 glass-panel border-red-500/20">
              <div className="flex items-center gap-6 mb-10">
                <div className="w-20 h-20 rounded-3xl bg-red-600/10 flex items-center justify-center text-red-500">
                  {selectedMarket === "Commercial REITs" ? <Building2 size={40} /> : selectedMarket === "Visa Programs" ? <Landmark size={40} /> : <CreditCard size={40} />}
                </div>
                <div>
                  <h2 className="text-4xl font-bold font-premium tracking-tighter">{selectedMarket}</h2>
                  <p className="text-gray-500 font-medium">Bespoke Institutional Investment Vehicle</p>
                </div>
              </div>

              <div className="space-y-8 mb-12">
                <div className="p-6 bg-white/5 rounded-2xl border border-white/5 leading-relaxed">
                  <h4 className="text-[10px] uppercase text-gray-500 font-bold mb-3 tracking-widest">Executive Summary</h4>
                  <p className="text-gray-300">Accessing private {selectedMarket.toLowerCase()} allows high-net-worth individuals to participate in securitized real estate debt and equity markets. This compliant instrument is natively tokenized on the Aureum Mainnet.</p>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="p-6 core-card space-y-2">
                    <div className="text-[10px] uppercase text-gray-500 font-bold">Minimum Entry</div>
                    <div className="text-2xl font-bold">100,000 AUR</div>
                  </div>
                  <div className="p-6 core-card space-y-2">
                    <div className="text-[10px] uppercase text-gray-500 font-bold">Target Yield</div>
                    <div className="text-2xl font-bold text-emerald-500">8.4% - 12%</div>
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <button onClick={() => setSelectedMarket(null)} className="btn-outline flex-1">Back to Ecosystem</button>
                <button
                  onClick={() => {
                    if (selectedMarket === "Visa Programs") setIsApplyingVisa(true);
                    else alert("Institutional entry for this instrument is currently limited to verified profiles.");
                  }}
                  className="btn-primary flex-1"
                >
                  Initiate Investment
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {isApplyingVisa && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-black/95 backdrop-blur-2xl flex items-center justify-center p-6"
          >
            <div className="max-w-lg w-full core-card p-10 glass-panel border-red-500/20">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 rounded-full bg-red-600/10 flex items-center justify-center text-red-500">
                  <Globe size={24} />
                </div>
                <div>
                  <h3 className="text-2xl font-bold font-premium tracking-tighter">Visa Application</h3>
                  <p className="text-gray-500 text-xs uppercase tracking-widest font-bold">Residency by Investment</p>
                </div>
              </div>

              <div className="space-y-6 mb-10">
                <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl mb-6">
                  <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest leading-relaxed">
                    Note: You must own a tokenized property with a minimum valuation of 500,000 AUR to be eligible for these programs.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase text-gray-500 font-bold tracking-widest">Select Program</label>
                  <select
                    className="input-field bg-black text-white outline-none appearance-none"
                    value={visaData.programIndex}
                    onChange={(e) => setVisaData({ ...visaData, programIndex: parseInt(e.target.value) })}
                  >
                    <option value={0}>Portugal Golden Visa (ARI)</option>
                    <option value={1}>UAE Golden Visa (10-Year)</option>
                    <option value={2}>UK High Value Residency (Tier 1)</option>
                    <option value={3}>Malta citizenship by Naturalisation</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase text-gray-500 font-bold tracking-widest">Property Transaction Hash / ID</label>
                  <input
                    placeholder="Enter the hash of your tokenized property"
                    className="input-field font-mono text-xs"
                    value={visaData.propertyId}
                    onChange={(e) => setVisaData({ ...visaData, propertyId: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 core-card space-y-1">
                    <div className="text-[8px] uppercase text-gray-500 font-bold">Application Fee</div>
                    <div className="text-sm font-bold">25 AUR</div>
                  </div>
                  <div className="p-4 core-card space-y-1">
                    <div className="text-[8px] uppercase text-gray-500 font-bold">Processing Time</div>
                    <div className="text-sm font-bold">Immediate (On-Chain)</div>
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <button onClick={() => setIsApplyingVisa(false)} className="btn-outline flex-1">Cancel</button>
                <button
                  onClick={handleApplyForVisa}
                  className="btn-primary flex-1"
                  disabled={isProcessing}
                >
                  {isProcessing ? "Transmitting..." : "Submit Application"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SidebarItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-5 p-4 rounded-2xl transition-all duration-300 ${active
        ? "bg-red-600/10 text-red-500 shadow-[inset_0_0_30px_rgba(232,65,66,0.05)] border border-red-500/10"
        : "text-gray-500 hover:text-white hover:bg-white/5"
        }`}
    >
      {icon}
      <span className="text-xs font-bold tracking-[0.2em] uppercase">{label}</span>
      {active && <motion.div layoutId="nav-ind" className="ml-auto w-1 h-1 rounded-full bg-red-500 shadow-[0_0_10px_#E84142]" />}
    </button>
  );
}

function AssetRow({ symbol, name, balance, value }: { symbol: string, name: string, balance: string, value: string }) {
  return (
    <div className="core-card p-8 flex justify-between items-center group cursor-pointer">
      <div className="flex items-center gap-6">
        <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center font-bold text-red-500 text-xl group-hover:bg-red-600 group-hover:text-white transition-all">
          {symbol[0]}
        </div>
        <div>
          <div className="text-2xl font-bold font-premium tracking-tight">{symbol}</div>
          <div className="text-[10px] text-gray-500 uppercase tracking-[0.3em] font-bold">{name}</div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-3xl font-bold font-premium">{balance}</div>
        <div className="text-sm text-gray-500 font-medium">{value}</div>
      </div>
    </div>
  );
}

function MarketTile({ icon, title, description, stats, onClick }: { icon: React.ReactNode, title: string, description: string, stats: string, onClick?: () => void }) {
  return (
    <div onClick={onClick} className="core-card p-8 group hover:bg-white/5 transition-all cursor-pointer hover:border-red-500/20">
      <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center mb-6 text-red-500 group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-3 font-premium">{title}</h3>
      <p className="text-sm text-gray-500 leading-relaxed mb-6">{description}</p>
      <div className="pt-6 border-t border-white/5 flex justify-between items-center text-[10px] font-bold text-red-500 uppercase tracking-widest">
        <span>{stats}</span>
        <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
      </div>
    </div>
  );
}

function TransactionRow({ type, from, to, property, amount, date, status }: {
  type: "sent" | "received" | "property",
  from?: string,
  to?: string,
  property?: string,
  amount: string,
  date: string,
  status: "confirmed" | "pending" | "escrow"
}) {
  const getIcon = () => {
    if (type === "received") return <Send size={20} className="rotate-180 text-emerald-500" />;
    if (type === "sent") return <Send size={20} className="text-red-500" />;
    return <Home size={20} className="text-blue-500" />;
  };

  const getLabel = () => {
    if (type === "received") return (
      <div className="flex flex-col">
        <span className="text-emerald-500 font-bold">Received from</span>
        <span className="text-[10px] font-mono text-gray-500 break-all">{from}</span>
      </div>
    );
    if (type === "sent") return (
      <div className="flex flex-col">
        <span className="text-red-500 font-bold">Sent to</span>
        <span className="text-[10px] font-mono text-gray-500 break-all">{to}</span>
      </div>
    );
    return <span className="font-bold">{property}</span>;
  };

  const getStatusColor = () => {
    if (status === "confirmed") return "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
    if (status === "pending") return "text-yellow-500 bg-yellow-500/10 border-yellow-500/20";
    return "text-blue-500 bg-blue-500/10 border-blue-500/20";
  };

  return (
    <div className="core-card p-6 flex items-center justify-between group hover:border-white/10 transition-all">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center">
          {getIcon()}
        </div>
        <div>
          <div className="text-sm font-bold text-white mb-1">{getLabel()}</div>
          <div className="text-xs text-gray-500 font-medium">{date}</div>
        </div>
      </div>
      <div className="text-right flex items-center gap-4">
        <div>
          <div className={`text-lg font-bold font-premium ${amount.startsWith('+') ? 'text-emerald-500' : 'text-gray-300'}`}>{amount}</div>
          <div className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md border ${getStatusColor()}`}>
            {status}
          </div>
        </div>
      </div>
    </div>
  );
}
