pragma solidity ^0.8.24;
import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract AIStorytellerRPGFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }

    struct StorytellerState {
        euint32 playerHistoryHash;
        euint32 lastQuestComplexity;
        euint32 lastQuestDrama;
        euint32 playerLevel;
        euint32 playerClass;
        euint32 worldStateSeed;
    }

    struct QuestParameters {
        euint32 targetComplexity;
        euint32 targetDrama;
        euint32 playerLevel;
        euint32 playerClass;
        euint32 worldStateSeed;
    }

    struct GeneratedQuest {
        euint32 complexity;
        euint32 drama;
        euint32 type;
        euint32 difficulty;
        euint32 reward;
    }

    struct StorytellerOutput {
        GeneratedQuest quest;
        euint32 nextWorldStateSeed;
    }

    address public owner;
    mapping(address => bool) public isProvider;
    mapping(uint256 => DecryptionContext) public decryptionContexts;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;
    mapping(uint256 => StorytellerState) public batchStates;
    mapping(uint256 => bool) public isBatchClosed;

    uint256 public currentBatchId;
    uint256 public cooldownSeconds;
    bool public paused;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event PauseToggled(bool paused);
    event CooldownSecondsSet(uint256 oldCooldownSeconds, uint256 newCooldownSeconds);
    event BatchOpened(uint256 batchId);
    event BatchClosed(uint256 batchId);
    event PlayerHistorySubmitted(address indexed player, uint256 batchId, euint32 playerHistoryHash);
    event DecryptionRequested(uint256 requestId, uint256 batchId);
    event DecryptionCompleted(uint256 requestId, uint256 batchId, uint256 questComplexity, uint256 questDrama, uint256 questType, uint256 questDifficulty, uint256 questReward, uint256 nextWorldStateSeed);

    error NotOwner();
    error NotProvider();
    error Paused();
    error CooldownActive();
    error BatchClosedOrInvalid();
    error ReplayAttempt();
    error StateMismatch();
    error InvalidBatchId();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!isProvider[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier checkSubmissionCooldown() {
        if (block.timestamp < lastSubmissionTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    modifier checkDecryptionCooldown() {
        if (block.timestamp < lastDecryptionRequestTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    constructor() {
        owner = msg.sender;
        isProvider[owner] = true;
        cooldownSeconds = 60;
        currentBatchId = 1;
        batchStates[currentBatchId] = StorytellerState({
            playerHistoryHash: FHE.asEuint32(0),
            lastQuestComplexity: FHE.asEuint32(0),
            lastQuestDrama: FHE.asEuint32(0),
            playerLevel: FHE.asEuint32(1),
            playerClass: FHE.asEuint32(1),
            worldStateSeed: FHE.asEuint32(block.timestamp)
        });
        emit ProviderAdded(owner);
        emit BatchOpened(currentBatchId);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    function addProvider(address provider) external onlyOwner {
        if (!isProvider[provider]) {
            isProvider[provider] = true;
            emit ProviderAdded(provider);
        }
    }

    function removeProvider(address provider) external onlyOwner {
        if (isProvider[provider]) {
            isProvider[provider] = false;
            emit ProviderRemoved(provider);
        }
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PauseToggled(_paused);
    }

    function setCooldownSeconds(uint256 newCooldownSeconds) external onlyOwner {
        uint256 oldCooldownSeconds = cooldownSeconds;
        cooldownSeconds = newCooldownSeconds;
        emit CooldownSecondsSet(oldCooldownSeconds, newCooldownSeconds);
    }

    function openNewBatch() external onlyOwner whenNotPaused {
        currentBatchId++;
        batchStates[currentBatchId] = StorytellerState({
            playerHistoryHash: FHE.asEuint32(0),
            lastQuestComplexity: FHE.asEuint32(0),
            lastQuestDrama: FHE.asEuint32(0),
            playerLevel: FHE.asEuint32(1),
            playerClass: FHE.asEuint32(1),
            worldStateSeed: FHE.asEuint32(block.timestamp)
        });
        emit BatchOpened(currentBatchId);
    }

    function closeCurrentBatch() external onlyOwner whenNotPaused {
        if (currentBatchId == 0) revert InvalidBatchId();
        isBatchClosed[currentBatchId] = true;
        emit BatchClosed(currentBatchId);
    }

    function submitPlayerHistory(
        euint32 playerHistoryHash,
        euint32 playerLevel,
        euint32 playerClass
    ) external onlyProvider whenNotPaused checkSubmissionCooldown {
        if (isBatchClosed[currentBatchId]) revert BatchClosedOrInvalid();
        lastSubmissionTime[msg.sender] = block.timestamp;

        StorytellerState storage state = batchStates[currentBatchId];
        state.playerHistoryHash = playerHistoryHash;
        state.playerLevel = playerLevel;
        state.playerClass = playerClass;

        emit PlayerHistorySubmitted(msg.sender, currentBatchId, playerHistoryHash);
    }

    function generateQuest() external onlyProvider whenNotPaused checkDecryptionCooldown {
        if (isBatchClosed[currentBatchId]) revert BatchClosedOrInvalid();
        lastDecryptionRequestTime[msg.sender] = block.timestamp;

        StorytellerState storage state = batchStates[currentBatchId];
        _initIfNeeded(state.playerHistoryHash);
        _initIfNeeded(state.lastQuestComplexity);
        _initIfNeeded(state.lastQuestDrama);
        _initIfNeeded(state.playerLevel);
        _initIfNeeded(state.playerClass);
        _initIfNeeded(state.worldStateSeed);

        euint32 targetComplexity = FHE.add(state.lastQuestComplexity, FHE.asEuint32(1));
        euint32 targetDrama = FHE.add(state.lastQuestDrama, FHE.asEuint32(1));

        QuestParameters memory params = QuestParameters({
            targetComplexity: targetComplexity,
            targetDrama: targetDrama,
            playerLevel: state.playerLevel,
            playerClass: state.playerClass,
            worldStateSeed: state.worldStateSeed
        });

        StorytellerOutput memory output = _generateQuestHomomorphically(params);

        euint32[] memory cts = new euint32[](6);
        cts[0] = output.quest.complexity;
        cts[1] = output.quest.drama;
        cts[2] = output.quest.type;
        cts[3] = output.quest.difficulty;
        cts[4] = output.quest.reward;
        cts[5] = output.nextWorldStateSeed;

        bytes32 stateHash = _hashCiphertexts(cts);
        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);
        decryptionContexts[requestId] = DecryptionContext({
            batchId: currentBatchId,
            stateHash: stateHash,
            processed: false
        });

        emit DecryptionRequested(requestId, currentBatchId);
    }

    function myCallback(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        if (decryptionContexts[requestId].processed) revert ReplayAttempt();

        DecryptionContext memory ctx = decryptionContexts[requestId];
        uint256 batchId = ctx.batchId;
        if (isBatchClosed[batchId]) revert BatchClosedOrInvalid();

        euint32[] memory cts = new euint32[](6);
        cts[0] = batchStates[batchId].lastQuestComplexity;
        cts[1] = batchStates[batchId].lastQuestDrama;
        cts[2] = FHE.asEuint32(0);
        cts[3] = FHE.asEuint32(0);
        cts[4] = FHE.asEuint32(0);
        cts[5] = batchStates[batchId].worldStateSeed;

        bytes32 currentHash = _hashCiphertexts(cts);
        if (currentHash != ctx.stateHash) revert StateMismatch();

        FHE.checkSignatures(requestId, cleartexts, proof);

        uint256 questComplexity = abi.decode(cleartexts, (uint256));
        cleartexts = _shiftCleartext(cleartexts, 32);
        uint256 questDrama = abi.decode(cleartexts, (uint256));
        cleartexts = _shiftCleartext(cleartexts, 32);
        uint256 questType = abi.decode(cleartexts, (uint256));
        cleartexts = _shiftCleartext(cleartexts, 32);
        uint256 questDifficulty = abi.decode(cleartexts, (uint256));
        cleartexts = _shiftCleartext(cleartexts, 32);
        uint256 questReward = abi.decode(cleartexts, (uint256));
        cleartexts = _shiftCleartext(cleartexts, 32);
        uint256 nextWorldStateSeed = abi.decode(cleartexts, (uint256));

        StorytellerState storage state = batchStates[batchId];
        state.lastQuestComplexity = FHE.asEuint32(questComplexity);
        state.lastQuestDrama = FHE.asEuint32(questDrama);
        state.worldStateSeed = FHE.asEuint32(nextWorldStateSeed);

        decryptionContexts[requestId].processed = true;
        emit DecryptionCompleted(requestId, batchId, questComplexity, questDrama, questType, questDifficulty, questReward, nextWorldStateSeed);
    }

    function _generateQuestHomomorphically(QuestParameters memory params) internal pure returns (StorytellerOutput memory) {
        euint32 complexity = FHE.add(params.targetComplexity, FHE.asEuint32(block.timestamp % 100));
        euint32 drama = FHE.add(params.targetDrama, FHE.asEuint32(block.timestamp % 50));
        euint32 questType = FHE.add(FHE.asEuint32(params.playerClass), FHE.asEuint32(block.timestamp % 10));
        euint32 difficulty = FHE.add(params.playerLevel, FHE.asEuint32(block.timestamp % 20));
        euint32 reward = FHE.mul(difficulty, FHE.asEuint32(100));
        euint32 nextWorldStateSeed = FHE.add(params.worldStateSeed, FHE.asEuint32(1));

        GeneratedQuest memory quest = GeneratedQuest({
            complexity: complexity,
            drama: drama,
            type: questType,
            difficulty: difficulty,
            reward: reward
        });

        return StorytellerOutput({ quest: quest, nextWorldStateSeed: nextWorldStateSeed });
    }

    function _hashCiphertexts(euint32[] memory cts) internal view returns (bytes32) {
        bytes32[] memory ctHashes = new bytes32[](cts.length);
        for (uint i = 0; i < cts.length; i++) {
            ctHashes[i] = FHE.toBytes32(cts[i]);
        }
        return keccak256(abi.encode(ctHashes, address(this)));
    }

    function _initIfNeeded(euint32 val) internal pure {
        if (!FHE.isInitialized(val)) {
            FHE.asEuint32(0);
        }
    }

    function _shiftCleartext(bytes memory data, uint256 n) internal pure returns (bytes memory) {
        require(n <= data.length, "Shift overflow");
        return data[n:data.length];
    }
}