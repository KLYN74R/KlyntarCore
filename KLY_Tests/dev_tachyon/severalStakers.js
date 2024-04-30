/*


This is the set of tests when there are several stakers in pool.

So, we deploy pool as usual, but with 3 stakers


*/

import bls from '../../KLY_Utils/signatures/multisig/bls.js'
import fetch from 'node-fetch'
import { ED25519_SIGN_DATA } from '../../KLY_Utils/utils.js'

//___________________________________________ CONSTANTS POOL ___________________________________________

const SYMBIOTE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' //chain on which you wanna send tx

const WORKFLOW_VERSION = 1 // since previous successfull tests - now workflow version is 1

const FEE = 5

const TX_TYPES = {
    TX: 'TX', // default address <=> address tx
    CONTRACT_DEPLOY: 'CONTRACT_DEPLOY',
    CONTRACT_CALL: 'CONTRACT_CALL',
    EVM_CALL: 'EVM_CALL',
    MIGRATE_BETWEEN_ENV: 'MIGRATE_BETWEEN_ENV'
}

const SIG_TYPES = {
    DEFAULT: 'D', // Default ed25519
    TBLS: 'T', // TBLS(threshold sig)
    POST_QUANTUM_DIL: 'P/D', // Post-quantum Dilithium(2/3/5,2 used by default)
    POST_QUANTUM_BLISS: 'P/B', // Post-quantum BLISS
    MULTISIG: 'M' // Multisig BLS
}

const SPECIAL_OPERATIONS_TYPES = {
    STAKING_CONTRACT_CALL: 'STAKING_CONTRACT_CALL',
    SLASH_UNSTAKE: 'SLASH_UNSTAKE',
    REMOVE_FROM_WAITING_ROOM: 'REMOVE_FROM_WAITING_ROOM',
    UPDATE_RUBICON: 'UPDATE_RUBICON',
    WORKFLOW_UPDATE: 'WORKFLOW_UPDATE',
    VERSION_UPDATE: 'VERSION_UPDATE'
}

//___________________________________________ TEST ACCOUNTS ___________________________________________

// BLS multisig
const POOL_OWNER = {
    privateKey: 'ff853a7829b94b48c4d54b8de8e70f023d54a73ae134a31ebb584ec83f1834ca',
    pubKey: '6TSGRz9KaTHtwtFXdLHoyvn1F5uQEysqz43nMH5DY3Zh2xtmKeuZST5PZR1zZVsCHk'
}

// FUTURE STAKERS____________

const STAKER_0 = {
    mnemonic: 'random stereo adult crew ill tonight defense usage pet glare shoe essay',
    bip44Path: "m/44'/7331'/0'/0'",
    pub: 'FbjP8LpTeujhpbrqeq3GiTeDgDvZUBWzuyGU49hzaTGb',
    prv: 'MC4CAQAwBQYDK2VwBCIEIAGbRnlDy4+w/WmG5thvyrUHjPURdQOWnSkg52Wkw1un'
}

const STAKER_1 = {
    mnemonic: 'device bike nice ocean antenna between essence monkey world vapor dove simple',
    bip44Path: "m/44'/7331'/0'/0'",
    pub: '8fJbrevJjKEgb6Q6ATe53eGUDk9w2X97fWTraqwivZKY',
    prv: 'MC4CAQAwBQYDK2VwBCIEIHm7ZUGDhlJhodES7CRuwfCPwY+wlaQy49lr+fu05ECg'
}

const STAKER_2 = {
    mnemonic: 'sentence gadget just violin guard feature orphan seminar road torch gesture forum',
    bip44Path: "m/44'/7331'/0'/0'",
    pub: '8NrFBfJqWKgBb8ig2Wwzz8ADvghSs4JYdvnZUN74fm9w',
    prv: 'MC4CAQAwBQYDK2VwBCIEIBp7DLyJIRASeNFyWPi/uXjpKD9GQ2uTuO9RN1J4rHrL'
}

//___________________________________________ FUNCTIONS ___________________________________________

let GET_ACCOUNT_DATA = async account => {
    return fetch(`http://localhost:7331/account/${account}`)
        .then(r => r.json())
        .catch(() => {
            console.log(_)

            console.log(`Can't get chain level data`)
        })
}

let SEND_TRANSACTION = transaction => {
    return fetch(
        'http://localhost:7332/transaction',

        {
            method: 'POST',

            body: JSON.stringify(transaction)
        }
    )
        .then(r => r.text())
        .catch(console.log)
}

let SEND_SPECIAL_OPERATION = (type, payload) => {
    return fetch(
        'http://localhost:7331/special_operations',

        {
            method: 'POST',

            body: JSON.stringify({ type, payload })
        }
    )
        .then(r => r.text())
        .catch(console.log)
}

/*

                                                    This is the set of tests related to the interactions with the pools' contracts.

                                                                                We need to test:


![*] ------------------------------------------------------- Pool deployment. See dev_tachyon/specContracts/stakingPool.js --------------------------------------------------------


    0) Create new pool(subchain) via TX_TYPE=CONTRACT_DEPLOY with the following payload

    {
        {
            bytecode:'',(empty)
            lang:'spec/stakingPool'
            constructorParams:[BLSPoolRootKey,Percentage,OverStake,WhiteList]
        }
    }

*    [*] BLSPoolRootKey - BLS pubkey for validator. The same as PoolID. It should be your pubkey or aggregated pubkey controlled by some group

    We'll create the pool for our KLY_TESTNET_V1 with the following creds

    {
        privateKey: '8cd685bd53078dd908dc49c40eb38c46305eba1473348b0a573f3598a5c2e32f',
        pubKey: '7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u'
    }


*    [*] Percentage - % of fees that will be earned by BLS pubkey related to PoolID. The rest(100%-Percentage) will be shared among stakers. The value is in range 0-1

    Our stake will be 70%(so the 30% will be shared among the rest validators). For this, set the value to 0.7
    
    

*    [*] OverStake - number of power(in UNO) allowed to overfill the minimum stake. You need this to prevent deletion from validators pool if your stake are lower than minimum
    
    Since the minimal required stake is 55000, we stake the KLY(not UNO) and we are a single validator in a pool - we can set the overstake to 0 because we can trust ourself that there will be no surprises with unstake
    


*    [*] WhiteList - array of addresses who can invest in this pool. Thanks to this, you can set own logic to distribute fees,make changes and so on by adding only one address - ID of smart contract

    To prevent contract call by the someone else, set the whitelist to ['7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u']





*    So, the payload for constructor for system contract will be like this:

    ['7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u',0.7,0,['7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u']]


+++++++++++++++++++++++++++++++++++++++++++++++++ RESULT +++++++++++++++++++++++++++++++++++++++++++++++++

After pool's contract deployment we should have the following in state


        0) Pool metadata should be present

        {
            key: '7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u(POOL)',
            value: {
                type: 'contract',
                lang: 'spec/stakingPool',
                balance: 0,
                uno: 0,
                storages: [ 'POOL' ],
                bytecode: ''
            }
        }

        1) Pool single storage 'POOL' should be present

        {

            key: '7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u(POOL)_STORAGE_POOL',
            value: {
                percentage: 0.7,
                overStake: 0,
                whiteList: ['7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u'],
                totalPower: 0,
                STAKERS: {},
                WAITING_ROOM: {}
            }
        }


On this step, we've created everything for pool. But it's still not active because we haven't staked on this. We'll stake during the next test below

*/

let DEPLOY_POOL_CONTRACT = async () => {
    /*
    
    0) Create new pool(subchain) via TX_TYPE=CONTRACT_DEPLOY with the following payload

    {
        {
            bytecode:'',(empty)
            lang:'spec/stakingPool'
            constructorParams:[BLSPoolRootKey,Percentage,OverStake,WhiteList]
        }
    }

    */

    let poolContractCreationTx = {
        v: WORKFLOW_VERSION,
        creator: POOL_OWNER.pubKey,
        type: 'CONTRACT_DEPLOY',
        nonce: 1,
        fee: FEE,
        payload: {
            //________________ Account related stuff ________________

            type: 'M', //multisig tx
            active: POOL_OWNER.pubKey,
            afk: [],

            //____________________ For contract _____________________

            bytecode: '',
            lang: 'spec/stakingPool',
            constructorParams: [POOL_OWNER.pubKey, 0.7, 10000, []]
        },
        sig: ''
    }

    let dataToSign =
        SYMBIOTE_ID +
        WORKFLOW_VERSION +
        'CONTRACT_DEPLOY' +
        JSON.stringify(poolContractCreationTx.payload) +
        poolContractCreationTx.nonce +
        FEE

    poolContractCreationTx.sig = await bls.singleSig(dataToSign, POOL_OWNER.privateKey)

    console.log(
        '\n=============== SIGNED METADATA FOR CONTRACT DEPLOYMENT IS READY ===============\n'
    )

    console.log(poolContractCreationTx)

    let status = await SEND_TRANSACTION(poolContractCreationTx)

    console.log('POOL DEPLOYMENT STATUS => ', status)
}

// DEPLOY_POOL_CONTRACT()

/*

![*] -------------------------------------------------------- Staking to existing pool --------------------------------------------------------


0) Insofar as for our pool we'll be a single staker, we should have at least 55000 KLY(due to WORKFLOW_OPTIONS on QUORUM_THREAD). We should call the <stake> method and send a 55 000 to contract

TX_TYPE=CONTRACT_CALL, required payload is

    {

        contractID:'7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u(POOL)',
        method:'stake',
        gasLimit:0,
        params:[A] params to pass to function. A is alias - see below
        imports:[] imports which should be included to contract instance to call. Example ['default.CROSS-CONTRACT','storage.GET_FROM_ARWEAVE']. As you understand, it's form like <MODULE_NAME>.<METHOD_TO_IMPORT>
        
    }

    This is the single parameter
    
    A={
        amount:55000
        units:'KLY'
    }

+++++++++++++++++++++++++++++++++++++++++++++++++ RESULT +++++++++++++++++++++++++++++++++++++++++++++++++

If stake was successfull, your balance will be reduced and your stake will be placed to WAITING_ROOM of contract. We'll speak about it during the next tests

The state will look like this

    {

        key: '7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u(POOL)_STORAGE_POOL',
        value: {
            percentage: 0.7,
            overStake: 0,
            whiteList: ['7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u'],
            totalPower: 0,
            STAKERS: {},
            WAITING_ROOM: {

                BLAKE3(tx.sig):{

                    checkpointID:global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.id,

                    staker:'7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u',

                    amount:55000,

                    units:'KLY',

                    type:'+' //means "STAKE"

                }

            }
        }
    }

*/

let SEND_STAKE_TX = async () => {
    /*
    
TX_TYPE=CONTRACT_CALL, required payload is

    {

        contractID:'7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u(POOL)',
        method:'stake',
        gasLimit:0,
        params:[A] params to pass to function. A is alias - see below
        imports:[] imports which should be included to contract instance to call. Example ['default.CROSS-CONTRACT','storage.GET_FROM_ARWEAVE']. As you understand, it's form like <MODULE_NAME>.<METHOD_TO_IMPORT>
        
    }

    This is the single parameter
    
    A={
        amount:55000
        units:'KLY'
    }


    */

    let stakingTxToPoolFromStaker = {
        v: WORKFLOW_VERSION,
        creator: STAKER_2.pub,
        type: 'CONTRACT_CALL',
        nonce: 1,
        fee: FEE,
        payload: {
            //________________ Account related stuff ________________

            type: 'D', //default, using ed25519 signature

            //____________________ For contract _____________________
            contractID: POOL_OWNER.pubKey + '(POOL)',
            method: 'stake',
            gasLimit: 0,
            params: [
                {
                    amount: 20000,
                    units: 'KLY'
                }
            ],
            imports: []
        },

        sig: ''
    }

    let dataToSign =
        SYMBIOTE_ID +
        WORKFLOW_VERSION +
        'CONTRACT_CALL' +
        JSON.stringify(stakingTxToPoolFromStaker.payload) +
        stakingTxToPoolFromStaker.nonce +
        FEE

    stakingTxToPoolFromStaker.sig = await ED25519_SIGN_DATA(dataToSign, STAKER_2.prv)

    console.log(
        '\n=============== SIGNED METADATA FOR CONTRACT DEPLOYMENT IS READY ===============\n'
    )

    console.log(stakingTxToPoolFromStaker)

    let status = await SEND_TRANSACTION(stakingTxToPoolFromStaker)

    console.log('SEND_STAKE TX STATUS => ', status)
}

// SEND_STAKE_TX()

/*

![*] -------------------------------------------------------- Move stake from WAITING_ROOM to pool --------------------------------------------------------

We need to add your stake to WAITING_ROOM and only after that - accept the stake to pool due to some sync stuff. QUORUM_THREAD and VERIFICATION_THREAD are async and works independently, however,
if you keep node synced - QT will be equal to VT.

So, once you notice that tx was successfully finalized and your stake is in WAITING_ROOM - you can create special operation to become the staker. It's the last step.
The only thing that you should take from the previous step - hash of tx signature BLAKE3(tx.sig) - because it's id of our staking transaction



0) Create the STAKING_CONTRACT_CALL special operation. Here's the structure

    {
        type:'STAKING_CONTRACT_CALL',
        
        payload:{

            {
                txid:BLAKE3(tx.sig),
                pool:'7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u',
                type:'+'
                amount:55000
    
            }

        }
    
    }


1) Send this special operation to ALL the members of current quorum. They'll make an overview(verification) and add to SPECIAL_OPERATIONS_MEMPOOL and as result - to the SPEICAL_OPERATIONS array in checkpoint

2) Nice - just wait till the next checkpoint and join to the rest of pools and work on your own subchain

3) After next checkpoint, the state will looks like this


    Pool metadata:

    {
        key: '7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u(POOL)',
        value: {
            type: 'contract',
            lang: 'spec/stakingPool',
            balance: 0,
            uno: 0,
            storages: [ 'POOL' ],
            bytecode: ''
        }
    }


    Pool storage:

    {

        key: '7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u(POOL)_STORAGE_POOL',
        value: {
            percentage: 0.7,
            overStake: 0,
            whiteList: ['7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u'],
            totalPower: 55000,
            STAKERS: {

                '7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u':{
                    
                    KLY:50000,
                    UNO:0,
                    REWARD:0
                }                

            },
            WAITING_ROOM: {}
        }
    }

As you see - you're now in STAKERS section. From this moment - all the rewards of this pool will be automatically distributed among all stakers in order to size of their stake
The object {KLY,UNO,REWARD} used for contract logic. We need KLY,UNO to know how many you can unstake and to allow unobtanium minters to change the value of your unobtanium.
REWARD shows how much you earned since the last <getReward> call.


*/

let MOVE_FROM_WAITING_ROOM_TO_STAKERS = async () => {
    /*
    
    Our 3 stakers received the following IDs from staking

        [+] FbjP8LpTeujhpbrqeq3GiTeDgDvZUBWzuyGU49hzaTGb => 3d40b9675451a754614b1f6e0aea24c3d57081f377dd452d23aa00e690031430

        [+] 8fJbrevJjKEgb6Q6ATe53eGUDk9w2X97fWTraqwivZKY => cdceb83b5374d11324cdce456df2c162e58b44b10a13bd6fae79600d3dde6fc6

        [+] 8NrFBfJqWKgBb8ig2Wwzz8ADvghSs4JYdvnZUN74fm9w => 0ad008ff4c7cdb9df786d47b1fd04c3e141d8d041b917363553e987fb11082d8
    
    
    */

    let TX_IDS_IN_WAITING_ROOM_OF_POOL = [
        '3d40b9675451a754614b1f6e0aea24c3d57081f377dd452d23aa00e690031430',
        'cdceb83b5374d11324cdce456df2c162e58b44b10a13bd6fae79600d3dde6fc6',
        '0ad008ff4c7cdb9df786d47b1fd04c3e141d8d041b917363553e987fb11082d8'
    ]

    for (let txid of TX_IDS_IN_WAITING_ROOM_OF_POOL) {
        let mySpecialOperation = {
            type: 'STAKING_CONTRACT_CALL',

            payload: {
                txid,
                pool: POOL_OWNER.pubKey,
                type: '+',
                amount: 20000
            }
        }

        let optionsToSend = {
            method: 'POST',
            body: JSON.stringify(mySpecialOperation)
        }

        // fetch('http://localhost:7331/special_operations',optionsToSend).then(r=>r.text()).then(resp=>console.log('STATUS => ',resp)) - disabled since previous checkpoint due to unstaking
        fetch('http://localhost:7332/special_operations', optionsToSend)
            .then(r => r.text())
            .then(resp => console.log('STATUS => ', resp))
        fetch('http://localhost:7333/special_operations', optionsToSend)
            .then(r => r.text())
            .then(resp => console.log('STATUS => ', resp))
        fetch('http://localhost:7334/special_operations', optionsToSend)
            .then(r => r.text())
            .then(resp => console.log('STATUS => ', resp))
    }
}

MOVE_FROM_WAITING_ROOM_TO_STAKERS()

/*
![*] ------------------------------------------------------ How to get rewards --------------------------------------------------------

Imagine that you want to get rewards from pool. Since previous step we have the following in state


[Pool storage]:
    
    {

        key: '7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u(POOL)_STORAGE_POOL',
        value: {
            percentage: 0.7,
            overStake: 0,
            whiteList: ['7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u'],
            totalPower: 55000-X,
            STAKERS: {

                '7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u':{
                    
                    KLY:55000-X,
                    UNO:0,
                    REWARD:Y
                }                

            },
            WAITING_ROOM: {}
        
        }

    }


0) You need to call the <getReward> function of pool to move the FULL reward(since previous reward withdraw) to your account

TX_TYPE=CONTRACT_CALL

PAYLOAD={

    contractID:'7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u',
    method:'getReward',
    gasLimit:0
    params:[]
    imports:[]

}

1) If OK - then you'll notice that your account state contains +Y on balance

*/

let GET_REWARD = async () => {
    const GENESIS_VALIDATOR_1 = {
        privateKey: '9607ad1de8eed220fd07143cfb0bf851d1ab3bafe498c77c2e51fd487db16f0e',

        pubKey: '75XPnpDxrAtyjcwXaATfDhkYTGBoHuonDU1tfqFc6JcNPf5sgtcsvBRXaXZGuJ8USG'
    }

    let getRewardTxCall = {
        v: WORKFLOW_VERSION,
        creator: GENESIS_VALIDATOR_1.pubKey,
        type: 'CONTRACT_CALL',
        nonce: 1,
        fee: FEE,
        payload: {
            //________________ Account related stuff ________________

            type: 'M', //multisig tx
            active: GENESIS_VALIDATOR_1.pubKey,
            afk: [],

            //____________________ For contract _____________________

            contractID: GENESIS_VALIDATOR_1.pubKey + '(POOL)',
            method: 'getReward',
            gasLimit: 0,
            params: [],
            imports: []
        },

        sig: ''
    }

    let dataToSign =
        SYMBIOTE_ID +
        WORKFLOW_VERSION +
        'CONTRACT_CALL' +
        JSON.stringify(getRewardTxCall.payload) +
        getRewardTxCall.nonce +
        FEE

    getRewardTxCall.sig = await bls.singleSig(dataToSign, GENESIS_VALIDATOR_1.privateKey)

    console.log(
        '\n=============== SIGNED TX TO CALL POOL CONTRACT AND GET THE REWARDS ===============\n'
    )

    console.log(getRewardTxCall)

    let status = await SEND_TRANSACTION(getRewardTxCall)

    console.log('STATUS => ', status)
}

// GET_REWARD()
