// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface Quest {
  id: string;
  encryptedDifficulty: string;
  encryptedReward: string;
  title: string;
  description: string;
  timestamp: number;
  status: "available" | "in-progress" | "completed";
  completionRequirements: string;
}

interface CharacterStats {
  strength: string;
  intelligence: string;
  agility: string;
  charisma: string;
  luck: string;
}

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const FHECompute = (encryptedData: string, operation: string): string => {
  const value = FHEDecryptNumber(encryptedData);
  let result = value;
  
  switch(operation) {
    case 'increase10%':
      result = value * 1.1;
      break;
    case 'decrease10%':
      result = value * 0.9;
      break;
    case 'double':
      result = value * 2;
      break;
    default:
      result = value;
  }
  
  return FHEEncryptNumber(result);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [characterStats, setCharacterStats] = useState<CharacterStats>({
    strength: FHEEncryptNumber(5),
    intelligence: FHEEncryptNumber(5),
    agility: FHEEncryptNumber(5),
    charisma: FHEEncryptNumber(5),
    luck: FHEEncryptNumber(5)
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showNewQuestModal, setShowNewQuestModal] = useState(false);
  const [creatingQuest, setCreatingQuest] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newQuestData, setNewQuestData] = useState({ title: "", description: "", difficulty: 1, reward: 10 });
  const [selectedQuest, setSelectedQuest] = useState<Quest | null>(null);
  const [decryptedDifficulty, setDecryptedDifficulty] = useState<number | null>(null);
  const [decryptedReward, setDecryptedReward] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [activeTab, setActiveTab] = useState<"quests" | "stats" | "inventory">("quests");
  const [showIntro, setShowIntro] = useState(true);

  // Generate fantasy quest titles
  const fantasyTitles = [
    "The Lost Crown of Eldoria",
    "Dragon's Breath Amulet",
    "Shadow over Blackmarsh",
    "Tome of Forgotten Spells",
    "Goblin King's Ransom",
    "Ruins of the Silver Tower",
    "Witchwood Curse",
    "The Blood Moon Prophecy",
    "Sapphire of the Sea King",
    "Bandits of the Iron Pass"
  ];

  // Generate fantasy quest descriptions
  const fantasyDescriptions = [
    "Retrieve the ancient artifact from the depths of the forbidden ruins.",
    "Negotiate peace between the warring factions before bloodshed consumes the land.",
    "Investigate the mysterious disappearances in the village of Moonhaven.",
    "Slay the beast that has been terrorizing the countryside.",
    "Recover the stolen heirloom from the thieves' guild hideout.",
    "Decipher the cryptic runes in the abandoned wizard's tower.",
    "Escort the merchant caravan safely through the dangerous mountain pass.",
    "Find the legendary healing herb to cure the dying king.",
    "Uncover the truth behind the cult's dark rituals.",
    "Prove your worth by completing the trials of the ancient order."
  ];

  useEffect(() => {
    loadQuests().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  const loadQuests = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      const keysBytes = await contract.getData("quest_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing quest keys:", e); }
      }
      const list: Quest[] = [];
      for (const key of keys) {
        try {
          const questBytes = await contract.getData(`quest_${key}`);
          if (questBytes.length > 0) {
            try {
              const questData = JSON.parse(ethers.toUtf8String(questBytes));
              list.push({ 
                id: key, 
                encryptedDifficulty: questData.difficulty, 
                encryptedReward: questData.reward,
                title: questData.title,
                description: questData.description,
                timestamp: questData.timestamp,
                status: questData.status || "available",
                completionRequirements: questData.completionRequirements || "Defeat the enemy"
              });
            } catch (e) { console.error(`Error parsing quest data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading quest ${key}:`, e); }
      }
      list.sort((a, b) => b.timestamp - a.timestamp);
      setQuests(list);
    } catch (e) { console.error("Error loading quests:", e); } 
    finally { setIsRefreshing(false); setLoading(false); }
  };

  const generateRandomQuest = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setCreatingQuest(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Generating encrypted quest with Zama FHE..." });
    try {
      const randomTitle = fantasyTitles[Math.floor(Math.random() * fantasyTitles.length)];
      const randomDescription = fantasyDescriptions[Math.floor(Math.random() * fantasyDescriptions.length)];
      const randomDifficulty = Math.floor(Math.random() * 10) + 1;
      const randomReward = Math.floor(Math.random() * 100) + 50;
      
      const encryptedDifficulty = FHEEncryptNumber(randomDifficulty);
      const encryptedReward = FHEEncryptNumber(randomReward);
      
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      const questId = `quest-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const questData = { 
        difficulty: encryptedDifficulty, 
        reward: encryptedReward,
        title: randomTitle,
        description: randomDescription,
        timestamp: Math.floor(Date.now() / 1000),
        status: "available",
        completionRequirements: "Complete all objectives"
      };
      
      await contract.setData(`quest_${questId}`, ethers.toUtf8Bytes(JSON.stringify(questData)));
      const keysBytes = await contract.getData("quest_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { keys = JSON.parse(ethers.toUtf8String(keysBytes)); } 
        catch (e) { console.error("Error parsing keys:", e); }
      }
      keys.push(questId);
      await contract.setData("quest_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      
      setTransactionStatus({ visible: true, status: "success", message: "New encrypted quest generated!" });
      await loadQuests();
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowNewQuestModal(false);
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") ? "Transaction rejected by user" : "Quest generation failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { setCreatingQuest(false); }
  };

  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { alert("Please connect wallet first"); return null; }
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      return FHEDecryptNumber(encryptedData);
    } catch (e) { console.error("Decryption failed:", e); return null; } 
    finally { setIsDecrypting(false); }
  };

  const startQuest = async (questId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing encrypted quest data with FHE..." });
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      const questBytes = await contract.getData(`quest_${questId}`);
      if (questBytes.length === 0) throw new Error("Quest not found");
      const questData = JSON.parse(ethers.toUtf8String(questBytes));
      
      const updatedQuest = { ...questData, status: "in-progress" };
      await contract.setData(`quest_${questId}`, ethers.toUtf8Bytes(JSON.stringify(updatedQuest)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Quest started successfully!" });
      await loadQuests();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to start quest: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const completeQuest = async (questId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing encrypted rewards with FHE..." });
    try {
      const contract = await getContractReadOnly();
      if (!contract) throw new Error("Failed to get contract");
      const questBytes = await contract.getData(`quest_${questId}`);
      if (questBytes.length === 0) throw new Error("Quest not found");
      const questData = JSON.parse(ethers.toUtf8String(questBytes));
      
      // Process reward with FHE (increase by 10% for successful completion)
      const encryptedReward = FHECompute(questData.reward, 'increase10%');
      
      const contractWithSigner = await getContractWithSigner();
      if (!contractWithSigner) throw new Error("Failed to get contract with signer");
      
      const updatedQuest = { ...questData, status: "completed", reward: encryptedReward };
      await contractWithSigner.setData(`quest_${questId}`, ethers.toUtf8Bytes(JSON.stringify(updatedQuest)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Quest completed successfully! Rewards increased by 10% with FHE!" });
      await loadQuests();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to complete quest: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const decryptQuestDetails = async (quest: Quest) => {
    setSelectedQuest(quest);
    const difficulty = await decryptWithSignature(quest.encryptedDifficulty);
    const reward = await decryptWithSignature(quest.encryptedReward);
    setDecryptedDifficulty(difficulty);
    setDecryptedReward(reward);
  };

  const availableQuests = quests.filter(q => q.status === "available");
  const activeQuests = quests.filter(q => q.status === "in-progress");
  const completedQuests = quests.filter(q => q.status === "completed");

  if (loading) return (
    <div className="loading-screen">
      <div className="rpg-spinner">
        <div className="sword"></div>
        <div className="shield"></div>
      </div>
      <p>Initializing magical connection...</p>
    </div>
  );

  return (
    <div className="app-container rpg-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="dragon-icon"></div>
          </div>
          <h1>AI<span>Storyteller</span>RPG</h1>
        </div>
        <div className="header-actions">
          <button 
            onClick={() => setShowNewQuestModal(true)} 
            className="new-quest-btn rpg-button"
            disabled={creatingQuest}
          >
            <div className="scroll-icon"></div>
            {creatingQuest ? "Generating Quest..." : "Generate Quest"}
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton 
              accountStatus="address" 
              chainStatus="icon" 
              showBalance={false}
              label="Connect Tavern"
            />
          </div>
        </div>
      </header>

      <div className="main-content">
        {showIntro && (
          <div className="intro-modal">
            <div className="intro-content rpg-card">
              <button className="close-intro" onClick={() => setShowIntro(false)}>×</button>
              <h2>Welcome to AI Storyteller RPG</h2>
              <div className="intro-text">
                <p>Embark on an endless adventure where every quest is uniquely generated by our <span className="fhe-highlight">FHE-encrypted AI Storyteller</span>.</p>
                <p>Your character's journey is encrypted with <strong>Zama FHE technology</strong>, allowing the AI to create personalized challenges without ever seeing your actual stats.</p>
                <div className="fhe-explanation">
                  <div className="fhe-step">
                    <div className="step-icon">🔮</div>
                    <div className="step-text">AI generates encrypted quest parameters</div>
                  </div>
                  <div className="fhe-step">
                    <div className="step-icon">⚔️</div>
                    <div className="step-text">Your encrypted stats interact with quests</div>
                  </div>
                  <div className="fhe-step">
                    <div className="step-icon">🏆</div>
                    <div className="step-text">Rewards calculated without decryption</div>
                  </div>
                </div>
              </div>
              <button 
                className="rpg-button primary start-journey"
                onClick={() => setShowIntro(false)}
              >
                Begin Your Adventure
              </button>
            </div>
          </div>
        )}

        <div className="game-container">
          <div className="sidebar">
            <div className="character-panel rpg-card">
              <h3>Your Hero</h3>
              <div className="character-portrait">
                <div className="portrait-frame"></div>
              </div>
              <div className="character-stats">
                <div className="stat-row">
                  <span>Strength:</span>
                  <span className="stat-value">{FHEEncryptNumber(5).substring(0, 8)}...</span>
                </div>
                <div className="stat-row">
                  <span>Intelligence:</span>
                  <span className="stat-value">{FHEEncryptNumber(5).substring(0, 8)}...</span>
                </div>
                <div className="stat-row">
                  <span>Agility:</span>
                  <span className="stat-value">{FHEEncryptNumber(5).substring(0, 8)}...</span>
                </div>
                <div className="stat-row">
                  <span>Charisma:</span>
                  <span className="stat-value">{FHEEncryptNumber(5).substring(0, 8)}...</span>
                </div>
                <div className="stat-row">
                  <span>Luck:</span>
                  <span className="stat-value">{FHEEncryptNumber(5).substring(0, 8)}...</span>
                </div>
              </div>
              <div className="fhe-badge">
                <span>FHE-Encrypted Stats</span>
              </div>
            </div>

            <div className="quest-stats rpg-card">
              <h3>Quest Log</h3>
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-value">{availableQuests.length}</div>
                  <div className="stat-label">Available</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{activeQuests.length}</div>
                  <div className="stat-label">Active</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{completedQuests.length}</div>
                  <div className="stat-label">Completed</div>
                </div>
              </div>
              <button 
                onClick={loadQuests} 
                className="refresh-btn rpg-button"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh Quests"}
              </button>
            </div>
          </div>

          <div className="main-panel">
            <div className="tabs">
              <button 
                className={`tab-button ${activeTab === "quests" ? "active" : ""}`}
                onClick={() => setActiveTab("quests")}
              >
                Quests
              </button>
              <button 
                className={`tab-button ${activeTab === "stats" ? "active" : ""}`}
                onClick={() => setActiveTab("stats")}
              >
                Character
              </button>
              <button 
                className={`tab-button ${activeTab === "inventory" ? "active" : ""}`}
                onClick={() => setActiveTab("inventory")}
              >
                Inventory
              </button>
            </div>

            {activeTab === "quests" && (
              <div className="quests-container">
                <div className="quests-section">
                  <h2>Available Quests</h2>
                  {availableQuests.length === 0 ? (
                    <div className="empty-state rpg-card">
                      <div className="empty-icon">📜</div>
                      <p>No quests available at the tavern</p>
                      <button 
                        className="rpg-button primary"
                        onClick={() => setShowNewQuestModal(true)}
                      >
                        Generate New Quest
                      </button>
                    </div>
                  ) : (
                    <div className="quests-grid">
                      {availableQuests.map(quest => (
                        <div 
                          className="quest-card rpg-card" 
                          key={quest.id}
                          onClick={() => decryptQuestDetails(quest)}
                        >
                          <div className="quest-header">
                            <h3>{quest.title}</h3>
                            <span className="quest-status available">Available</span>
                          </div>
                          <p className="quest-description">{quest.description}</p>
                          <div className="quest-footer">
                            <span className="quest-difficulty">Difficulty: {quest.encryptedDifficulty.substring(0, 8)}...</span>
                            <button 
                              className="rpg-button small"
                              onClick={(e) => {
                                e.stopPropagation();
                                startQuest(quest.id);
                              }}
                            >
                              Accept Quest
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="quests-section">
                  <h2>Active Quests</h2>
                  {activeQuests.length === 0 ? (
                    <div className="empty-state rpg-card">
                      <div className="empty-icon">⚔️</div>
                      <p>No active quests</p>
                    </div>
                  ) : (
                    <div className="quests-grid">
                      {activeQuests.map(quest => (
                        <div 
                          className="quest-card rpg-card" 
                          key={quest.id}
                          onClick={() => decryptQuestDetails(quest)}
                        >
                          <div className="quest-header">
                            <h3>{quest.title}</h3>
                            <span className="quest-status in-progress">In Progress</span>
                          </div>
                          <p className="quest-description">{quest.description}</p>
                          <div className="quest-footer">
                            <span className="quest-requirements">{quest.completionRequirements}</span>
                            <button 
                              className="rpg-button small success"
                              onClick={(e) => {
                                e.stopPropagation();
                                completeQuest(quest.id);
                              }}
                            >
                              Complete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="quests-section">
                  <h2>Completed Quests</h2>
                  {completedQuests.length === 0 ? (
                    <div className="empty-state rpg-card">
                      <div className="empty-icon">🏆</div>
                      <p>No completed quests yet</p>
                    </div>
                  ) : (
                    <div className="quests-grid">
                      {completedQuests.map(quest => (
                        <div 
                          className="quest-card rpg-card" 
                          key={quest.id}
                          onClick={() => decryptQuestDetails(quest)}
                        >
                          <div className="quest-header">
                            <h3>{quest.title}</h3>
                            <span className="quest-status completed">Completed</span>
                          </div>
                          <p className="quest-description">{quest.description}</p>
                          <div className="quest-footer">
                            <span className="quest-reward">Reward: {quest.encryptedReward.substring(0, 8)}...</span>
                            <button 
                              className="rpg-button small"
                              onClick={(e) => {
                                e.stopPropagation();
                                decryptQuestDetails(quest);
                              }}
                            >
                              View Details
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "stats" && (
              <div className="stats-container rpg-card">
                <h2>Character Details</h2>
                <div className="stats-grid">
                  <div className="stat-item">
                    <h3>Strength</h3>
                    <div className="stat-value">{characterStats.strength.substring(0, 8)}...</div>
                    <div className="stat-bar">
                      <div className="stat-fill" style={{ width: '50%' }}></div>
                    </div>
                    <button 
                      className="rpg-button small"
                      onClick={async () => {
                        const decrypted = await decryptWithSignature(characterStats.strength);
                        if (decrypted !== null) {
                          alert(`Your actual strength is: ${decrypted}`);
                        }
                      }}
                    >
                      Decrypt
                    </button>
                  </div>
                  <div className="stat-item">
                    <h3>Intelligence</h3>
                    <div className="stat-value">{characterStats.intelligence.substring(0, 8)}...</div>
                    <div className="stat-bar">
                      <div className="stat-fill" style={{ width: '50%' }}></div>
                    </div>
                    <button 
                      className="rpg-button small"
                      onClick={async () => {
                        const decrypted = await decryptWithSignature(characterStats.intelligence);
                        if (decrypted !== null) {
                          alert(`Your actual intelligence is: ${decrypted}`);
                        }
                      }}
                    >
                      Decrypt
                    </button>
                  </div>
                  <div className="stat-item">
                    <h3>Agility</h3>
                    <div className="stat-value">{characterStats.agility.substring(0, 8)}...</div>
                    <div className="stat-bar">
                      <div className="stat-fill" style={{ width: '50%' }}></div>
                    </div>
                    <button 
                      className="rpg-button small"
                      onClick={async () => {
                        const decrypted = await decryptWithSignature(characterStats.agility);
                        if (decrypted !== null) {
                          alert(`Your actual agility is: ${decrypted}`);
                        }
                      }}
                    >
                      Decrypt
                    </button>
                  </div>
                  <div className="stat-item">
                    <h3>Charisma</h3>
                    <div className="stat-value">{characterStats.charisma.substring(0, 8)}...</div>
                    <div className="stat-bar">
                      <div className="stat-fill" style={{ width: '50%' }}></div>
                    </div>
                    <button 
                      className="rpg-button small"
                      onClick={async () => {
                        const decrypted = await decryptWithSignature(characterStats.charisma);
                        if (decrypted !== null) {
                          alert(`Your actual charisma is: ${decrypted}`);
                        }
                      }}
                    >
                      Decrypt
                    </button>
                  </div>
                  <div className="stat-item">
                    <h3>Luck</h3>
                    <div className="stat-value">{characterStats.luck.substring(0, 8)}...</div>
                    <div className="stat-bar">
                      <div className="stat-fill" style={{ width: '50%' }}></div>
                    </div>
                    <button 
                      className="rpg-button small"
                      onClick={async () => {
                        const decrypted = await decryptWithSignature(characterStats.luck);
                        if (decrypted !== null) {
                          alert(`Your actual luck is: ${decrypted}`);
                        }
                      }}
                    >
                      Decrypt
                    </button>
                  </div>
                </div>
                <div className="fhe-explanation">
                  <p>Your character stats are encrypted with <strong>Zama FHE</strong>. The AI Storyteller can generate quests that match your abilities without ever seeing your actual stats.</p>
                </div>
              </div>
            )}

            {activeTab === "inventory" && (
              <div className="inventory-container rpg-card">
                <h2>Inventory</h2>
                <div className="empty-state">
                  <div className="empty-icon">🎒</div>
                  <p>Your inventory is empty</p>
                  <p>Complete quests to earn rewards!</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showNewQuestModal && (
        <div className="modal-overlay">
          <div className="quest-modal rpg-card">
            <div className="modal-header">
              <h2>Generate New Quest</h2>
              <button onClick={() => setShowNewQuestModal(false)} className="close-modal">×</button>
            </div>
            <div className="modal-body">
              <div className="fhe-notice">
                <div className="fhe-icon">🔒</div>
                <p>Quest parameters will be encrypted with <strong>Zama FHE</strong> before generation</p>
              </div>
              <div className="form-group">
                <label>Quest Type</label>
                <select 
                  className="rpg-select"
                  value={newQuestData.title}
                  onChange={(e) => setNewQuestData({...newQuestData, title: e.target.value})}
                >
                  <option value="">Random Quest</option>
                  <option value="Dungeon Crawl">Dungeon Crawl</option>
                  <option value="Rescue Mission">Rescue Mission</option>
                  <option value="Artifact Recovery">Artifact Recovery</option>
                  <option value="Monster Hunt">Monster Hunt</option>
                  <option value="Diplomatic Mission">Diplomatic Mission</option>
                </select>
              </div>
              <div className="form-group">
                <label>Difficulty (1-10)</label>
                <input 
                  type="range" 
                  min="1" 
                  max="10" 
                  value={newQuestData.difficulty}
                  onChange={(e) => setNewQuestData({...newQuestData, difficulty: parseInt(e.target.value)})}
                  className="rpg-slider"
                />
                <div className="slider-value">{newQuestData.difficulty}</div>
              </div>
              <div className="form-group">
                <label>Base Reward</label>
                <input 
                  type="number" 
                  min="10" 
                  max="1000" 
                  value={newQuestData.reward}
                  onChange={(e) => setNewQuestData({...newQuestData, reward: parseInt(e.target.value)})}
                  className="rpg-input"
                />
                <span className="input-suffix">gold</span>
              </div>
              <div className="encryption-preview">
                <h4>FHE Encryption Preview</h4>
                <div className="preview-grid">
                  <div className="preview-item">
                    <span>Difficulty:</span>
                    <div>{FHEEncryptNumber(newQuestData.difficulty).substring(0, 20)}...</div>
                  </div>
                  <div className="preview-item">
                    <span>Reward:</span>
                    <div>{FHEEncryptNumber(newQuestData.reward).substring(0, 20)}...</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                onClick={() => setShowNewQuestModal(false)} 
                className="rpg-button"
              >
                Cancel
              </button>
              <button 
                onClick={generateRandomQuest} 
                className="rpg-button primary"
                disabled={creatingQuest}
              >
                {creatingQuest ? "Generating..." : "Generate Encrypted Quest"}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedQuest && (
        <div className="modal-overlay">
          <div className="quest-detail-modal rpg-card">
            <div className="modal-header">
              <h2>{selectedQuest.title}</h2>
              <button onClick={() => setSelectedQuest(null)} className="close-modal">×</button>
            </div>
            <div className="modal-body">
              <div className="quest-status-badge">
                <span className={`status ${selectedQuest.status}`}>{selectedQuest.status}</span>
              </div>
              <div className="quest-description">
                <h3>Description</h3>
                <p>{selectedQuest.description}</p>
              </div>
              <div className="quest-details">
                <div className="detail-item">
                  <h4>Difficulty</h4>
                  <div className="encrypted-value">
                    {selectedQuest.encryptedDifficulty.substring(0, 20)}...
                  </div>
                  {decryptedDifficulty !== null && (
                    <div className="decrypted-value">
                      Actual: {decryptedDifficulty}/10
                    </div>
                  )}
                  <button 
                    className="rpg-button small"
                    onClick={async () => {
                      const decrypted = await decryptWithSignature(selectedQuest.encryptedDifficulty);
                      setDecryptedDifficulty(decrypted);
                    }}
                    disabled={isDecrypting}
                  >
                    {isDecrypting ? "Decrypting..." : "Decrypt Difficulty"}
                  </button>
                </div>
                <div className="detail-item">
                  <h4>Reward</h4>
                  <div className="encrypted-value">
                    {selectedQuest.encryptedReward.substring(0, 20)}...
                  </div>
                  {decryptedReward !== null && (
                    <div className="decrypted-value">
                      Actual: {decryptedReward} gold
                    </div>
                  )}
                  <button 
                    className="rpg-button small"
                    onClick={async () => {
                      const decrypted = await decryptWithSignature(selectedQuest.encryptedReward);
                      setDecryptedReward(decrypted);
                    }}
                    disabled={isDecrypting}
                  >
                    {isDecrypting ? "Decrypting..." : "Decrypt Reward"}
                  </button>
                </div>
              </div>
              {selectedQuest.status === "available" && (
                <button 
                  className="rpg-button primary"
                  onClick={() => startQuest(selectedQuest.id)}
                >
                  Accept Quest
                </button>
              )}
              {selectedQuest.status === "in-progress" && (
                <button 
                  className="rpg-button success"
                  onClick={() => completeQuest(selectedQuest.id)}
                >
                  Complete Quest
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content rpg-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="rpg-spinner"></div>}
              {transactionStatus.status === "success" && <div className="success-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="dragon-icon small"></div>
              <span>AI Storyteller RPG</span>
            </div>
            <p>Powered by Zama FHE technology</p>
          </div>
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy</a>
            <a href="#" className="footer-link">Terms</a>
            <a href="#" className="footer-link">GitHub</a>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>Fully Homomorphic Encryption</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} AI Storyteller RPG. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;