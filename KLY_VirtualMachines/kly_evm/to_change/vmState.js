"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VmState = void 0;
const common_1 = require("@ethereumjs/common");
const precompiles_1 = require("@ethereumjs/evm/dist/precompiles");
const util_1 = require("@ethereumjs/util");
const debug_1 = require("debug");
const journaling_1 = require("./journaling");
class VmState {
    constructor({ common, stateManager }) {
        this.DEBUG = false;
        this._checkpointCount = 0;
        this._stateManager = stateManager;
        this._common = common ?? new common_1.Common({ chain: common_1.Chain.Mainnet, hardfork: common_1.Hardfork.Petersburg });
        this._originalStorageCache = new Map();
        this._accessedStorage = [new Map()];
        this._accessedStorageReverted = [new Map()];
        this.touchedJournal = new journaling_1.Journaling();
        // Skip DEBUG calls unless 'ethjs' included in environmental DEBUG variables
        this.DEBUG = process?.env?.DEBUG?.includes('ethjs') ?? false;
        this._debug = (0, debug_1.debug)('vm:state');
    }
    /**
     * Checkpoints the current state of the StateManager instance.
     * State changes that follow can then be committed by calling
     * `commit` or `reverted` by calling rollback.
     *
     * Partial implementation, called from the subclass.
     */
    async checkpoint() {
        if (this._common.gteHardfork(common_1.Hardfork.Berlin)) {
            this._accessedStorage.push(new Map());
        }
        await this._stateManager.checkpoint();
        this._checkpointCount++;
        this.touchedJournal.checkpoint();
        if (this.DEBUG) {
            this._debug('-'.repeat(100));
            this._debug(`state checkpoint`);
        }
    }
    async commit() {
        if (this._common.gteHardfork(common_1.Hardfork.Berlin)) {
            // Copy the contents of the map of the current level to a map higher.
            const storageMap = this._accessedStorage.pop();
            if (storageMap) {
                this._accessedStorageMerge(this._accessedStorage, storageMap);
            }
        }
        await this._stateManager.commit();
        this.touchedJournal.commit();
        this._checkpointCount--;
        if (this._checkpointCount === 0) {
            await this._stateManager.flush();
            this._clearOriginalStorageCache();
        }
        if (this.DEBUG) {
            this._debug(`state checkpoint committed`);
        }
    }
    /**
     * Reverts the current change-set to the instance since the
     * last call to checkpoint.
     *
     * Partial implementation , called from the subclass.
     */
    async revert() {
        if (this._common.gteHardfork(common_1.Hardfork.Berlin)) {
            // setup cache checkpointing
            const lastItem = this._accessedStorage.pop();
            if (lastItem) {
                this._accessedStorageReverted.push(lastItem);
            }
        }
        await this._stateManager.revert();
        this.touchedJournal.revert(precompiles_1.ripemdPrecompileAddress);
        this._checkpointCount--;
        if (this._checkpointCount === 0) {
            await this._stateManager.flush();
            this._clearOriginalStorageCache();
        }
        if (this.DEBUG) {
            this._debug(`state checkpoint reverted`);
        }
    }
    async getAccount(address) {
        return this._stateManager.getAccount(address);
    }
    async putAccount(address, account) {
        await this._stateManager.putAccount(address, account);
        await this.touchAccount(address);
    }
    async modifyAccountFields(address, accountFields) {
        return this._stateManager.modifyAccountFields(address, accountFields);
    }
    /**
     * Deletes an account from state under the provided `address`. The account will also be removed from the state trie.
     * @param address - Address of the account which should be deleted
     */
    async deleteAccount(address) {
        await this._stateManager.deleteAccount(address);
        await this.touchAccount(address);
    }
    async getContractCode(address) {
        return this._stateManager.getContractCode(address);
    }
    async putContractCode(address, value) {
        return this._stateManager.putContractCode(address, value);
    }
    async getContractStorage(address, key) {
        return this._stateManager.getContractStorage(address, key);
    }
    async putContractStorage(address, key, value) {
        await this._stateManager.putContractStorage(address, key, value);
        await this.touchAccount(address);
    }
    async clearContractStorage(address) {
        await this._stateManager.clearContractStorage(address);
        await this.touchAccount(address);
    }
    async accountExists(address) {
        return this._stateManager.accountExists(address);
    }
    async setStateRoot(stateRoot) {
        if (this._checkpointCount !== 0) {
            throw new Error('Cannot set state root with uncommitted checkpoints');
        }
        return this._stateManager.setStateRoot(stateRoot);
    }
    async getStateRoot() {
        return this._stateManager.getStateRoot();
    }
    async hasStateRoot(root) {
        return this._stateManager.hasStateRoot(root);
    }
    /**
     * Marks an account as touched, according to the definition
     * in [EIP-158](https://eips.ethereum.org/EIPS/eip-158).
     * This happens when the account is triggered for a state-changing
     * event. Touched accounts that are empty will be cleared
     * at the end of the tx.
     */
    async touchAccount(address) {
        
        // KLY-EVM extra logic

        let lowerCaseAddressAsStringWithout0x = address.buf.toString('hex');

        if(!this.isSandboxExecution){

            global.CREATED_EVM_ACCOUNTS.add('0x'+lowerCaseAddressAsStringWithout0x)

        }


        this.touchedJournal.addJournalItem(address.buf.toString('hex'));

    }
    /**
     * Merges a storage map into the last item of the accessed storage stack
     */
    _accessedStorageMerge(storageList, storageMap) {
        const mapTarget = storageList[storageList.length - 1];
        if (mapTarget !== undefined) {
            // Note: storageMap is always defined here per definition (TypeScript cannot infer this)
            for (const [addressString, slotSet] of storageMap) {
                const addressExists = mapTarget.get(addressString);
                if (!addressExists) {
                    mapTarget.set(addressString, new Set());
                }
                const storageSet = mapTarget.get(addressString);
                for (const value of slotSet) {
                    storageSet.add(value);
                }
            }
        }
    }
    /**
     * Initializes the provided genesis state into the state trie.
     * Will error if there are uncommitted checkpoints on the instance.
     * @param initState address -> balance | [balance, code, storage]
     */
    async generateCanonicalGenesis(initState) {
        if (this._checkpointCount !== 0) {
            throw new Error('Cannot create genesis state with uncommitted checkpoints');
        }
        if (this.DEBUG) {
            this._debug(`Save genesis state into the state trie`);
        }
        const addresses = Object.keys(initState);
        for (const address of addresses) {
            const addr = util_1.Address.fromString(address);
            const state = initState[address];
            if (!Array.isArray(state)) {
                // Prior format: address -> balance
                const account = util_1.Account.fromAccountData({ balance: state });
                await this.putAccount(addr, account);
            }
            else {
                // New format: address -> [balance, code, storage]
                const [balance, code, storage] = state;
                const account = util_1.Account.fromAccountData({ balance });
                await this.putAccount(addr, account);
                if (code !== undefined) {
                    await this.putContractCode(addr, (0, util_1.toBuffer)(code));
                }
                if (storage !== undefined) {
                    for (const [key, value] of storage) {
                        await this.putContractStorage(addr, (0, util_1.toBuffer)(key), (0, util_1.toBuffer)(value));
                    }
                }
            }
        }
        await this._stateManager.flush();
    }
    /**
     * Removes accounts form the state trie that have been touched,
     * as defined in EIP-161 (https://eips.ethereum.org/EIPS/eip-161).
     */
    async cleanupTouchedAccounts() {
        if (this._common.gteHardfork(common_1.Hardfork.SpuriousDragon) === true) {
            const touchedArray = Array.from(this.touchedJournal.journal);
            for (const addressHex of touchedArray) {
                const address = new util_1.Address(Buffer.from(addressHex, 'hex'));
                const empty = await this.accountIsEmpty(address);
                if (empty) {
                    await this._stateManager.deleteAccount(address);
                    if (this.DEBUG) {
                        this._debug(`Cleanup touched account address=${address} (>= SpuriousDragon)`);
                    }
                }
            }
        }
        this.touchedJournal.clear();
    }
    /**
     * Caches the storage value associated with the provided `address` and `key`
     * on first invocation, and returns the cached (original) value from then
     * onwards. This is used to get the original value of a storage slot for
     * computing gas costs according to EIP-1283.
     * @param address - Address of the account to get the storage for
     * @param key - Key in the account's storage to get the value for. Must be 32 bytes long.
     */
    async getOriginalContractStorage(address, key) {
        if (key.length !== 32) {
            throw new Error('Storage key must be 32 bytes long');
        }
        const addressHex = address.buf.toString('hex');
        const keyHex = key.toString('hex');
        let map;
        if (!this._originalStorageCache.has(addressHex)) {
            map = new Map();
            this._originalStorageCache.set(addressHex, map);
        }
        else {
            map = this._originalStorageCache.get(addressHex);
        }
        if (map.has(keyHex)) {
            return map.get(keyHex);
        }
        else {
            const current = await this.getContractStorage(address, key);
            map.set(keyHex, current);
            return current;
        }
    }
    /**
     * Clears the original storage cache. Refer to {@link StateManager.getOriginalContractStorage}
     * for more explanation.
     */
    _clearOriginalStorageCache() {
        this._originalStorageCache = new Map();
    }
    /**
     * Clears the original storage cache. Refer to {@link StateManager.getOriginalContractStorage}
     * for more explanation. Alias of the internal {@link StateManager._clearOriginalStorageCache}
     */
    clearOriginalStorageCache() {
        this._clearOriginalStorageCache();
    }
    /** EIP-2929 logic
     * This should only be called from within the EVM
     */
    /**
     * Returns true if the address is warm in the current context
     * @param address - The address (as a Buffer) to check
     */
    isWarmedAddress(address) {
        for (let i = this._accessedStorage.length - 1; i >= 0; i--) {
            const currentMap = this._accessedStorage[i];
            if (currentMap.has(address.toString('hex'))) {
                return true;
            }
        }
        return false;
    }
    /**
     * Add a warm address in the current context
     * @param address - The address (as a Buffer) to check
     */
    addWarmedAddress(address) {
        const key = address.toString('hex');
        const storageSet = this._accessedStorage[this._accessedStorage.length - 1].get(key);
        if (!storageSet) {
            const emptyStorage = new Set();
            this._accessedStorage[this._accessedStorage.length - 1].set(key, emptyStorage);
        }
    }
    /**
     * Returns true if the slot of the address is warm
     * @param address - The address (as a Buffer) to check
     * @param slot - The slot (as a Buffer) to check
     */
    isWarmedStorage(address, slot) {
        const addressKey = address.toString('hex');
        const storageKey = slot.toString('hex');
        for (let i = this._accessedStorage.length - 1; i >= 0; i--) {
            const currentMap = this._accessedStorage[i];
            if (currentMap.has(addressKey) && currentMap.get(addressKey).has(storageKey)) {
                return true;
            }
        }
        return false;
    }
    /**
     * Mark the storage slot in the address as warm in the current context
     * @param address - The address (as a Buffer) to check
     * @param slot - The slot (as a Buffer) to check
     */
    addWarmedStorage(address, slot) {
        const addressKey = address.toString('hex');
        let storageSet = this._accessedStorage[this._accessedStorage.length - 1].get(addressKey);
        if (!storageSet) {
            storageSet = new Set();
            this._accessedStorage[this._accessedStorage.length - 1].set(addressKey, storageSet);
        }
        storageSet.add(slot.toString('hex'));
    }
    /**
     * Clear the warm accounts and storage. To be called after a transaction finished.
     */
    clearWarmedAccounts() {
        this._accessedStorage = [new Map()];
        this._accessedStorageReverted = [new Map()];
    }
    /**
     * Generates an EIP-2930 access list
     *
     * Note: this method is not yet part of the {@link StateManager} interface.
     * If not implemented, {@link VM.runTx} is not allowed to be used with the
     * `reportAccessList` option and will instead throw.
     *
     * Note: there is an edge case on accessList generation where an
     * internal call might revert without an accessList but pass if the
     * accessList is used for a tx run (so the subsequent behavior might change).
     * This edge case is not covered by this implementation.
     *
     * @param addressesRemoved - List of addresses to be removed from the final list
     * @param addressesOnlyStorage - List of addresses only to be added in case of present storage slots
     *
     * @returns - an [@ethereumjs/tx](https://github.com/ethereumjs/ethereumjs-monorepo/packages/tx) `AccessList`
     */
    generateAccessList(addressesRemoved = [], addressesOnlyStorage = []) {
        // Merge with the reverted storage list
        const mergedStorage = [...this._accessedStorage, ...this._accessedStorageReverted];
        // Fold merged storage array into one Map
        while (mergedStorage.length >= 2) {
            const storageMap = mergedStorage.pop();
            if (storageMap) {
                this._accessedStorageMerge(mergedStorage, storageMap);
            }
        }
        const folded = new Map([...mergedStorage[0].entries()].sort());
        // Transfer folded map to final structure
        const accessList = [];
        for (const [addressStr, slots] of folded.entries()) {
            const address = util_1.Address.fromString(`0x${addressStr}`);
            const check1 = addressesRemoved.find((a) => a.equals(address));
            const check2 = addressesOnlyStorage.find((a) => a.equals(address)) !== undefined && slots.size === 0;
            if (!check1 && !check2) {
                const storageSlots = Array.from(slots)
                    .map((s) => `0x${s}`)
                    .sort();
                const accessListItem = {
                    address: `0x${addressStr}`,
                    storageKeys: storageSlots,
                };
                accessList.push(accessListItem);
            }
        }
        return accessList;
    }
    /**
     * Checks if the `account` corresponding to `address`
     * is empty or non-existent as defined in
     * EIP-161 (https://eips.ethereum.org/EIPS/eip-161).
     * @param address - Address to check
     */
    async accountIsEmpty(address) {
        return this._stateManager.accountIsEmpty(address);
    }
}
exports.VmState = VmState;
//# sourceMappingURL=vmState.js.map