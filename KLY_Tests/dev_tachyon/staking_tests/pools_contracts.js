import {signEd25519,verifyEd25519} from '../../../KLY_Utils/utils.js'

import fetch from 'node-fetch'




//___________________________________________ CONSTANTS POOL ___________________________________________




const SYMBIOTIC_CHAIN_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' // chain on which you wanna send tx

const SHARD = '9GQ46rqY238rk2neSwgidap9ww5zbAN4dyqyC7j5ZnBK'

const WORKFLOW_VERSION = 0

const FEE = 5

const TX_TYPES = {

    TX:'TX', // default address <=> address tx
    CONTRACT_DEPLOY:'CONTRACT_DEPLOY',
    CONTRACT_CALL:'CONTRACT_CALL',
    EVM_CALL:'EVM_CALL',
    MIGRATE_BETWEEN_ENV:'MIGRATE_BETWEEN_ENV'

}

const SIG_TYPES = {
    
    DEFAULT:'D',                    // Default ed25519
    TBLS:'T',                       // TBLS(threshold sig)
    POST_QUANTUM_DIL:'P/D',         // Post-quantum Dilithium(2/3/5,2 used by default)
    POST_QUANTUM_BLISS:'P/B',       // Post-quantum BLISS
    MULTISIG:'M'                    // Multisig BLS
}

const EPOCH_EDGE_OPERATIONS_TYPES = {

    STAKING_CONTRACT_CALL:'STAKING_CONTRACT_CALL',
    SLASH_UNSTAKE:'SLASH_UNSTAKE',
    REMOVE_FROM_WAITING_ROOM:'REMOVE_FROM_WAITING_ROOM',
    RUBICON_UPDATE:'RUBICON_UPDATE',
    WORKFLOW_UPDATE:'WORKFLOW_UPDATE',
    VERSION_UPDATE:'VERSION_UPDATE',

}

//___________________________________________ TEST ACCOUNTS ___________________________________________

// Ed25519 keypair. Pubkey is pool id

const POOL_OWNER = {

    pubKey:"6XvZpuCDjdvSuot3eLr24C1wqzcf2w4QqeDh9BnDKsNE",

    privateKey:"MC4CAQAwBQYDK2VwBCIEIJT7NA/u+Df874H2DFRbyg43LpJwlhcRsS3Bv8/FUIZN"
    
}


//___________________________________________ FUNCTIONS ___________________________________________


let GET_ACCOUNT_DATA = async account=>{

    return fetch(`http://localhost:7332/state/${SHARD}/${account}`)

    .then(r=>r.json()).catch(()=>{})

}


let SEND_TRANSACTION=transaction=>{

    return fetch('http://localhost:7331/transaction',

        {
        
            method:'POST',
        
            body:JSON.stringify(transaction)
    
        }

    ).then(r=>r.text()).catch(console.log)

}




/*

                                                    This is the set of tests related to the interactions with the pools' contracts.

                                                                                We need to test:


![*] ------------------------------------------------------- Pool deployment. See dev_tachyon/systemContracts/stakingPool.js --------------------------------------------------------


    0) Create new pool via TX_TYPE = CONTRACT_DEPLOY with the following payload

    {
        {
            bytecode:'',(empty)
            lang:'spec/stakingPool'
            constructorParams:[Ed25519PoolRootKey,Percentage,OverStake,WhiteList,PoolURL]
        }
    }

*    [*] Ed25519PoolRootKey - Ed25519 pubkey for validator. The same as PoolID

    We'll create the pool for our KLY_TESTNET_V1 with the following creds

    {

        pubKey:"6XvZpuCDjdvSuot3eLr24C1wqzcf2w4QqeDh9BnDKsNE",
        privateKey:"MC4CAQAwBQYDK2VwBCIEIJT7NA/u+Df874H2DFRbyg43LpJwlhcRsS3Bv8/FUIZN"
    
    }

 

*    [*] Percentage - % of fees that will be earned by Ed25519 pubkey related to PoolID. The rest(100-Percentage %) will be shared among stakers. The value is in range 0-1

    Our stake will be 70%(so the 30% will be shared among the rest stakers). For this, set the value to 0.7
    
    

*    [*] OverStake - number of power(in UNO) allowed to overfill the minimum stake. You need this to prevent deletion from validators pool if your stake are lower than minimum
    
    Since the minimal required stake is 55000, we stake the KLY(not UNO) and we are a single validator in a pool - we can set the overstake to 0 because we can trust ourself that there will be no surprises with unstake
    


*    [*] WhiteList - array of addresses who can stake in this pool. Thanks to this, you can set own logic to distribute fees, make changes and so on by adding only one address - ID of smart contract

    To prevent contract call by the someone else, set the whitelist to ['6XvZpuCDjdvSuot3eLr24C1wqzcf2w4QqeDh9BnDKsNE']


*    [*] PoolURL - endpoint to know how to find pool authority. Need to grab finalization proofs and so on.

    The default form is http(s)://<domain_or_ip>:<port>/<optional path>

    The valid examples are:

        http://localhost:9333
        http://subdomain.of.some.domain:1337
        https://dead::cafe:6666/with_path

    ! NOTE: Make sure that there is no "/"<slash> in the end of URL to avoid failed fetch call
    ! NOTE x2: This URL might be changed later via tons of plugins available on KLY - it will be useful for sharing work, scaling, avoiding spam/DDoS and so on


*    So, the payload for constructor for system contract will be like this:

    ['6XvZpuCDjdvSuot3eLr24C1wqzcf2w4QqeDh9BnDKsNE',0.7,0,['6XvZpuCDjdvSuot3eLr24C1wqzcf2w4QqeDh9BnDKsNE'],'http://localhost:7334']


+++++++++++++++++++++++++++++++++++++++++++++++++ RESULT +++++++++++++++++++++++++++++++++++++++++++++++++

After pool's contract deployment we should have the following in state


        0) Pool metadata should be present

        {
            key: '9GQ46rqY238rk2neSwgidap9ww5zbAN4dyqyC7j5ZnBK:6XvZpuCDjdvSuot3eLr24C1wqzcf2w4QqeDh9BnDKsNE(POOL)',
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

            key: '9GQ46rqY238rk2neSwgidap9ww5zbAN4dyqyC7j5ZnBK:6XvZpuCDjdvSuot3eLr24C1wqzcf2w4QqeDh9BnDKsNE(POOL)_STORAGE_POOL',
            value: {
                percentage: 0.7,
                overStake: 0,
                whiteList: ['6XvZpuCDjdvSuot3eLr24C1wqzcf2w4QqeDh9BnDKsNE'],
                totalPower: 0,
                stakers: {},
                waitingRoom: {},
                poolURL:'http://localhost:7334'
            }
        }


On this step, we've created everything for pool. But it's still not active because we haven't staked on this. We'll stake during the next test below

*/


let DEPLOY_POOL_CONTRACT=async()=>{


    /*
    
    0) Create new pool(subchain) via TX_TYPE=CONTRACT_DEPLOY with the following payload

    {
        {
            bytecode:'',(empty)
            lang:'spec/stakingPool'
            constructorParams:[Ed25519PoolRootKey,Percentage,OverStake,WhiteList]
        }
    }

    */

    let poolContractCreationTx={
        v: 0,
        creator: '6XvZpuCDjdvSuot3eLr24C1wqzcf2w4QqeDh9BnDKsNE',
        type: 'CONTRACT_DEPLOY',
        nonce: 1,
        fee: 5,
        payload: {
          type: 'D',
          bytecode: '',
          lang: 'system/stakingPool',
          constructorParams: [
            '6XvZpuCDjdvSuot3eLr24C1wqzcf2w4QqeDh9BnDKsNE',
            0.7,
            0,
            ['6XvZpuCDjdvSuot3eLr24C1wqzcf2w4QqeDh9BnDKsNE'],
            'http://localhost:7334'
          ]
        },
        sig: 'cKJHTq1o2LbwmJZzLfn7zErpN7oZv/5P9wbpddNAeUC3HTvi6+S36Ye7IB8Ay6C4ehumCSz1/Ex/lNnUyypwDQ=='
    }

    console.log('\n=============== SIGNED METADATA FOR CONTRACT DEPLOYMENT IS READY ===============\n')

    console.log(poolContractCreationTx)

    let status = await SEND_TRANSACTION(poolContractCreationTx)

    console.log('POOL DEPLOYMENT STATUS => ',status);

}



// DEPLOY_POOL_CONTRACT()





/*

![*] -------------------------------------------------------- Staking to existing pool --------------------------------------------------------


0) Insofar as for our pool we'll be a single staker, we should have at least 55000 KLY(due to WORKFLOW_OPTIONS on QUORUM_THREAD). We should call the <stake> method and send a 55 000 to contract

TX_TYPE=CONTRACT_CALL, required payload is

    {

        contractID:'6XvZpuCDjdvSuot3eLr24C1wqzcf2w4QqeDh9BnDKsNE(POOL)',
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

        key: '6XvZpuCDjdvSuot3eLr24C1wqzcf2w4QqeDh9BnDKsNE(POOL)_STORAGE_POOL',
        value: {
            percentage: 0.7,
            overStake: 0,
            whiteList: ['6XvZpuCDjdvSuot3eLr24C1wqzcf2w4QqeDh9BnDKsNE'],
            totalPower: 0,
            stakers: {},
            waitingRoom: {

                BLAKE3(tx.sig):{

                    checkpointID:global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.id,

                    staker:'6XvZpuCDjdvSuot3eLr24C1wqzcf2w4QqeDh9BnDKsNE',

                    amount:55000,

                    units:'KLY',

                    type:'+' //means "STAKE"

                }

            }
        }
    }

*/


let SEND_STAKE_TX=async()=>{


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

    let stakingTxToPool={

        v:WORKFLOW_VERSION,
        creator:POOL_OWNER.pubKey,
        type:'CONTRACT_CALL',
        nonce:5,
        fee:FEE,
        payload:{
            
            //________________ Account related stuff ________________

            type:'M', //multisig tx
            active:POOL_OWNER.pubKey,
            afk:[],

            //____________________ For contract _____________________
            contractID:POOL_OWNER.pubKey+'(POOL)',
            method:'stake',
            gasLimit:0,
            params:[

                {
                    amount:500,
                    units:'KLY'
                }

            ],
            imports:[] 
            
        },

        sig:''

    }


    let dataToSign = SYMBIOTIC_CHAIN_ID+WORKFLOW_VERSION+'CONTRACT_CALL'+JSON.stringify(stakingTxToPool.payload)+stakingTxToPool.nonce+FEE

    stakingTxToPool.sig=await bls.singleSig(dataToSign,POOL_OWNER.privateKey)

    console.log('\n=============== SIGNED METADATA FOR CONTRACT DEPLOYMENT IS READY ===============\n')

    console.log(stakingTxToPool)

    let status = await SEND_TRANSACTION(stakingTxToPool)

    console.log('SEND_STAKE TX STATUS => ',status);

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
            stakers: {

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




let MOVE_FROM_WAITING_ROOM_TO_STAKERS=async()=>{

    let mySpecialOperation = {

        type:'STAKING_CONTRACT_CALL',
        
        payload:{

            txid:'dba4f76346a945aaf6855f2c98904c871a14a4c81d46fd93ff2f248296509c5d',
            pool:'7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u',
            type:'+',
            amount:50000
    
        }
    
    }


    let optionsToSend = {

        method:'POST',
        body:JSON.stringify(mySpecialOperation)
    
    }
    
    
    fetch('http://localhost:7331/special_operations',optionsToSend).then(r=>r.text()).then(resp=>console.log('STATUS => ',resp))
    fetch('http://localhost:7332/special_operations',optionsToSend).then(r=>r.text()).then(resp=>console.log('STATUS => ',resp))
    fetch('http://localhost:7333/special_operations',optionsToSend).then(r=>r.text()).then(resp=>console.log('STATUS => ',resp))
    //fetch('http://localhost:7334/special_operations',optionsToSend).then(r=>r.text()).then(resp=>console.log('STATUS => ',resp))

}


// MOVE_FROM_WAITING_ROOM_TO_STAKERS()



/*

![*] -------------------------------------------------------- How to unstake --------------------------------------------------------

Unstaking - is important part of work with pools & stakers because require appropriate security & reliability stuff.
Unstaking isn't instant process - the unstaking period is declared in workflow options via UNSTAKING_PERIOD property. This shows difference in checkpoints' IDs

For example, if you call unstake function of pool's contract(see KLY_Workflows/dev_tachyon/specContracts/stakingPool.js), you loose the staker status and your UNSTAKE operation moves to WAITING_ROOM

___________________________________________________________[Steps to unstake]___________________________________________________________

0) Send the contract call operation with the following payload

TX_TYPE = CONTRACT_CALL(see dev_tachyon/verifiers.js)

PAYLOD = {

    contractID:'7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u(POOL)',
    method:'unstake',
    gasLimit:0,
    params:[A] params to pass to function. A is alias - see below
    imports:[]

}

A={
    amount:<amount in KLY or UNO> | NOTE:must be int - not float
    type:<KLY|UNO>
}

Note: You can unstake the same sum you've staked or less(not more😃)

1) If call was successfull - then the state will looks like this



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
                    
                    KLY:55000,
                    UNO:0,
                    REWARD:0
                }                

            },
            WAITING_ROOM: {

                '<BLAKE3(tx.sig)>':{

                    checkpointID:global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.id,

                    staker:'7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u',

                    amount:X,

                    units:'KLY',

                    type:'-' //means "UNSTAKE"

                }

            }
        
        }

    }


2) The second part - create the special operation as a final step of unstaking

For this, we need to send STAKING_CONTRACT_CALL operation to ALL the current quorum members

{
    type:'STAKING_CONTRACT_CALL',
    payload:{

        {
            txid:BLAKE3(tx.sig)<id in WAITING_ROOM in contract storage> - take this from your contract call tx on previous step
            pool:''7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u',
            type:'-'
            amount:X
        }
    
    }

}

If such txid present in WAITING_ROOM of this pool and all the verification stuff successfully passed - then we check the UNSTAKING_PERIOD(it might be various dependent on network solutions).

By default - it's 4.

Based on info in record WAITING_ROOM of your pool - we can understand when it will be possible for your to unstake and get funds(KLY/UNO) back.

If you've unstaked on CHECKPOINT_ID=1337, that's mean that you'll have ability to finish unstaking at least on 1337+UNSTAKING_PERIOD(4)=1341st checkpoint(~ 4 days)

******************************************************************
* The minimal required unstaking period for dev_tachyon - 3 days *
******************************************************************

3) After that, your unstaking tx will be pushed to DELAYED_OPERATIONS array.

This is the array which identifies by checkpointID and performed once it's time for it

For example, if current CHECKPOINT_ID = 1337, then the array of DELAYED_OPERATIONS related to this checkpoint will be executed on the 1341st checkpoint

From the previous step, the state looks like this


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

[DELAYED_OPERATIONS]:

[

    {

        fromPool:'7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u',

        to:'7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u',
                        
        amount:X,
                        
        units:'KLY'

    },
    ...(other delayed operations from checkpoint 1337th)

]


4) Finally, you'll get back your X KLY


*/


let UNSTAKING=async()=>{

    
    const GENESIS_VALIDATOR_1 = {

        privateKey:"af837c459929895651315e878f4917c7622daeb522086ec95cfe64fed2496867",
        pubKey:"7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta"
    
    }

    
    let unstakingTxToPool={

        v:WORKFLOW_VERSION,
        creator:GENESIS_VALIDATOR_1.pubKey,
        type:'CONTRACT_CALL',
        nonce:2,
        fee:FEE,
        payload:{
            
            //________________ Account related stuff ________________

            type:'M', //multisig tx
            active:GENESIS_VALIDATOR_1.pubKey,
            afk:[],

            //____________________ For contract _____________________

            contractID:GENESIS_VALIDATOR_1.pubKey+'(POOL)',
            method:'unstake',
            gasLimit:0,
            params:[

                {
                    amount:50000,
                    units:'KLY'
                }

            ],
            imports:[] 
            
        },

        sig:''

    }


    let dataToSign = SYMBIOTIC_CHAIN_ID+WORKFLOW_VERSION+'CONTRACT_CALL'+JSON.stringify(unstakingTxToPool.payload)+unstakingTxToPool.nonce+FEE

    unstakingTxToPool.sig=await bls.singleSig(dataToSign,GENESIS_VALIDATOR_1.privateKey)

    console.log('\n=============== SIGNED TX FOR UNSTAKING ===============\n')

    console.log(unstakingTxToPool)

    let status = await SEND_TRANSACTION(unstakingTxToPool)

    console.log('UNSTAKING TX STATUS => ',status);


}


// UNSTAKING()


// And special operation to move from WAITING ROOM to delayed operations




let MOVE_FROM_WAITING_ROOM_TO_UNSTAKE=async()=>{

    let mySpecialOperationToUnstake = {

        type:'STAKING_CONTRACT_CALL',
        
        payload:{

            txid:'3af3102de898b8fc67f1400e14b8542a42d1d09125cd7a737cb7d00b14b93498',
            pool:'7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta',
            type:'-',
            amount:50000
    
        }
    
    }


    let optionsToSend = {

        method:'POST',
        body:JSON.stringify(mySpecialOperationToUnstake)
    
    }
    
    
    fetch('http://localhost:7331/special_operations',optionsToSend).then(r=>r.text()).then(resp=>console.log('STATUS => ',resp))
    fetch('http://localhost:7332/special_operations',optionsToSend).then(r=>r.text()).then(resp=>console.log('STATUS => ',resp))
    fetch('http://localhost:7333/special_operations',optionsToSend).then(r=>r.text()).then(resp=>console.log('STATUS => ',resp))
    //fetch('http://localhost:7334/special_operations',optionsToSend).then(r=>r.text()).then(resp=>console.log('STATUS => ',resp))

}


// MOVE_FROM_WAITING_ROOM_TO_UNSTAKE()




//________________________ GET INFO ________________________

let acc2Stat = await GET_ACCOUNT_DATA(POOL_OWNER.pubKey+'(POOL)_STORAGE_POOL')

console.log(acc2Stat)