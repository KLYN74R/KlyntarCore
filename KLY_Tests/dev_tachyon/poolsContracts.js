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
    
    Hence the minimal required stake is 55000, we stake the KLY(not UNO) and we are a single validator in a pool - we can set the overstake to 0 because we can trust ourself that there will be no surprises with unstake
    


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



![*] -------------------------------------------------------- Staking to existing pool --------------------------------------------------------


0) Insofar as for our pool we'll be a single staker, we should have at least 55000 KLY(due to WORKFLOW_OPTIONS on QUORUM_THREAD). We should call the <stake> method and send a 55 000 to contract

TX_TYPE=CONTRACT_CALL, required payload is

    {

        contractID:'7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u(POOL)',
        method:'stake',
        energyLimit:0,
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

                BLAKE3(event.sig):{

                    checkpointID:SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.HEADER.ID,

                    staker:'7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u',

                    amount:55000,

                    units:'KLY',

                    type:'+' //means "STAKE"

                }

            }
        }
    }



![*] -------------------------------------------------------- Move stake from WAITING_ROOM to pool --------------------------------------------------------

We need to add your stake to WAITING_ROOM and only after that - accept the stake to pool due to some sync stuff. QUORUM_THREAD and VERIFICATION_THREAD are async and works independently, however,
if you keep node synced - QT will be equal to VT.

So, once you notice that tx was successfully finalized and your stake is in WAITING_ROOM - you can create special operation to become the staker. It's the last step.
The only thing that you should take from the previous step - hash of event signature BLAKE3(event.sig) - because it's id of our staking transaction



0) Create the STAKING_CONTRACT_CALL special operation. Here's the structure

    {
        type:'STAKING_CONTRACT_CALL',
        
        payload:{

            {
                txid:BLAKE3(event.sig),
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
                    
                    KLY:55000,
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
    energyLimit:0,
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

                '<BLAKE3(event.sig)>':{

                    checkpointID:SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.HEADER.ID,

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
            txid:BLAKE3(event.sig)<id in WAITING_ROOM in contract storage> - take this from your contract call tx on previous step
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
    energyLimit:0
    params:[]
    imports:[]

}

1) If OK - then you'll notice that your account state contains +Y on balance

*/




import {SIG} from '../../KLY_Utils/utils.js'
import {hash} from 'blake3-wasm'
import fetch from 'node-fetch'
import bls from '../../KLY_Utils/signatures/multisig/bls.js'



//___________________________________________ CONSTANTS POOL ___________________________________________



const SYMBIOTE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'//chain on which you wanna send tx

const WORKFLOW_VERSION = 0

const FEE = 5

const TX_TYPES = {

    TX:'TX', // default address <=> address tx
    CONTRACT_DEPLOY:'CONTRACT_DEPLOY',
    CONTRACT_CALL:'CONTRACT_CALL',
    EVM_CALL:'EVM_CALL',
    MIGRATE_TO_EVM:'MIGRATE_TO_EVM'

}

const SIG_TYPES = {
    
    DEFAULT:'D',                    // Default ed25519
    TBLS:'T',                       // TBLS(threshold sig)
    POST_QUANTUM_DIL:'P/D',         // Post-quantum Dilithium(2/3/5,2 used by default)
    POST_QUANTUM_BLISS:'P/B',       // Post-quantum BLISS
    MULTISIG:'M'                    // Multisig BLS
}

const SPECIAL_OPERATIONS_TYPES={

    STAKING_CONTRACT_CALL:'STAKING_CONTRACT_CALL',
    STOP_VALIDATOR:'STOP_VALIDATOR',
    SLASH_UNSTAKE:'SLASH_UNSTAKE',
    REMOVE_FROM_WAITING_ROOM:'REMOVE_FROM_WAITING_ROOM',
    UPDATE_RUBICON:'UPDATE_RUBICON',
    WORKFLOW_UPDATE:'WORKFLOW_UPDATE',
    VERSION_UPDATE:'VERSION_UPDATE',

}

//___________________________________________ TEST ACCOUNTS ___________________________________________


// BLS multisig
const POOL_OWNER = {

    privateKey: '8cd685bd53078dd908dc49c40eb38c46305eba1473348b0a573f3598a5c2e32f',
    pubKey: '7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u'
    
}


//___________________________________________ FUNCTIONS ___________________________________________


let GET_ACCOUNT_DATA=async account=>{

    return fetch(`http://localhost:6666/account/${account}`)

    .then(r=>r.json()).catch(_=>{
    
        console.log(_)

        console.log(`Can't get chain level data`)

    })

}


let BLAKE3=v=>hash(v).toString('hex')


let GET_EVENT_TEMPLATE=async(account,txType,sigType,nonce,payload)=>{


    let template = {

        v:WORKFLOW_VERSION,
        creator:account.pub,
        type:txType,
        nonce,
        fee:FEE,
        payload,
        sig:''
    
    }

    template.payload.type=sigType

    if(sigType===SIG_TYPES.DEFAULT){

        template.sig = await SIG(SYMBIOTE_ID+WORKFLOW_VERSION+txType+JSON.stringify(payload)+nonce+FEE,account.prv)

    }else if (sigType===SIG_TYPES.MULTISIG){
        
        template.sig = await bls.singleSig(SYMBIOTE_ID+WORKFLOW_VERSION+txType+JSON.stringify(payload)+nonce+FEE,account.prv)
    
    }

    return template

}




let SEND_EVENT=event=>{

    return fetch('http://localhost:6666/event',

        {
        
            method:'POST',
        
            body:JSON.stringify({symbiote:SYMBIOTE_ID,event})
    
        }

    ).then(r=>r.text()).catch(console.log)

}



let SEND_SPECIAL_OPERATION=(type,payload)=>{

    return fetch('http://localhost:6666/special_operations',

        {
        
            method:'POST',
        
            body:JSON.stringify({type,payload})
    
        }

    ).then(r=>r.text()).catch(console.log)

}



// ![*] ------------------------------------------------------- Pool deployment. See dev_tachyon/specContracts/stakingPool.js --------------------------------------------------------

let DEPLOY_POOL_CONTRACT=async()=>{


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

    let poolContractCreationTx={

        v:WORKFLOW_VERSION,
        creator:POOL_OWNER.pubKey,
        type:'CONTRACT_DEPLOY',
        nonce:1,
        fee:FEE,
        payload:{
            
            //________________ Account related stuff ________________

            type:'M', //multisig tx
            active:'7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u',
            afk:[],

            //____________________ For contract _____________________

            bytecode:'',
            lang:'spec/stakingPool',
            constructorParams:['7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u',0.7,0,['7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u']]
        },
        sig:''

    }


    let dataToSign = SYMBIOTE_ID+WORKFLOW_VERSION+'CONTRACT_DEPLOY'+JSON.stringify(poolContractCreationTx.payload)+poolContractCreationTx.nonce+FEE

    poolContractCreationTx.sig=await bls.singleSig(dataToSign,POOL_OWNER.privateKey)

    console.log('\n=============== SIGNED METADATA FOR CONTRACT DEPLOYMENT IS READY ===============\n')

    console.log(poolContractCreationTx)

    let status = await SEND_EVENT(poolContractCreationTx)

    console.log('POOL DEPLOYMENT STATUS => ',status);

}



// DEPLOY_POOL_CONTRACT()



// ![*] -------------------------------------------------------- Staking to existing pool --------------------------------------------------------



let SEND_STAKE_TX=async()=>{


    /*
    
TX_TYPE=CONTRACT_CALL, required payload is

    {

        contractID:'7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u(POOL)',
        method:'stake',
        energyLimit:0,
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
        nonce:11,
        fee:FEE,
        payload:{
            
            //________________ Account related stuff ________________

            type:'M', //multisig tx
            active:'7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u',
            afk:[],

            //____________________ For contract _____________________
            contractID:'7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u(POOL)',
            method:'stake',
            energyLimit:0,
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


    let dataToSign = SYMBIOTE_ID+WORKFLOW_VERSION+'CONTRACT_CALL'+JSON.stringify(stakingTxToPool.payload)+stakingTxToPool.nonce+FEE

    stakingTxToPool.sig=await bls.singleSig(dataToSign,POOL_OWNER.privateKey)

    console.log('\n=============== SIGNED METADATA FOR CONTRACT DEPLOYMENT IS READY ===============\n')

    console.log(stakingTxToPool)

    let status = await SEND_EVENT(stakingTxToPool)

    console.log('POOL DEPLOYMENT STATUS => ',status);

}




SEND_STAKE_TX()




//________________________ GET INFO ________________________

// let acc2Stat = await GET_ACCOUNT_DATA(user2.pub)
