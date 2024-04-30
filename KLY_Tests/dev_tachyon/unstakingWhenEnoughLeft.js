/*


This is the set of tests when there are several stakers in pool.

So, we deploy pool as usual, but with 3 stakers


*/

import bls from '../../KLY_Utils/signatures/multisig/bls.js'
import fetch from 'node-fetch'

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

//___________________________________________ CONSTANTS POOL ___________________________________________

const SYMBIOTE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' //chain on which you wanna send tx

const WORKFLOW_VERSION = 0 // since previous successfull tests - now workflow version is 1

const FEE = 5

let GET_ACCOUNT_DATA = async account => {
    return fetch(`http://localhost:7332/account/${account}`)
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

let UNSTAKING = async () => {
    const GENESIS_VALIDATOR_2 = {
        privateKey: 'aa73f1798339b56fbf9a7e8e73b69a2e0e8d71dcaa9d9d114c6bd467d79d5d24',

        pubKey: '61TXxKDrBtb7bjpBym8zS9xRDoUQU6sW9aLvvqN9Bp9LVFiSxhRPd9Dwy3N3621RQ8'
    }

    let unstakingTxToPool = {
        v: WORKFLOW_VERSION,
        creator: GENESIS_VALIDATOR_2.pubKey,
        type: 'CONTRACT_CALL',
        nonce: 3,
        fee: FEE,
        payload: {
            //________________ Account related stuff ________________

            type: 'M', //multisig tx
            active: GENESIS_VALIDATOR_2.pubKey,
            afk: [],

            //____________________ For contract _____________________

            contractID: GENESIS_VALIDATOR_2.pubKey + '(POOL)',
            method: 'unstake',
            gasLimit: 0,
            params: [
                {
                    amount: 3000,
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
        JSON.stringify(unstakingTxToPool.payload) +
        unstakingTxToPool.nonce +
        FEE

    unstakingTxToPool.sig = await bls.singleSig(dataToSign, GENESIS_VALIDATOR_2.privateKey)

    console.log('\n=============== SIGNED TX FOR UNSTAKING ===============\n')

    console.log(unstakingTxToPool)

    let status = await SEND_TRANSACTION(unstakingTxToPool)

    console.log('UNSTAKING TX STATUS => ', status)
}

// UNSTAKING()

// And special operation to move from WAITING ROOM to delayed operations

let MOVE_FROM_WAITING_ROOM_TO_UNSTAKE = async () => {
    let mySpecialOperationToUnstake = {
        type: 'STAKING_CONTRACT_CALL',

        payload: {
            txid: 'aae9aedd0db7a8fbca2345a20fa389824e6ad361d9d9754a1f53ea41d57847dc',
            pool: '75XPnpDxrAtyjcwXaATfDhkYTGBoHuonDU1tfqFc6JcNPf5sgtcsvBRXaXZGuJ8USG',
            type: '-',
            amount: 3000
        }
    }

    let optionsToSend = {
        method: 'POST',
        body: JSON.stringify(mySpecialOperationToUnstake)
    }

    fetch('http://localhost:7332/special_operations', optionsToSend)
        .then(r => r.text())
        .then(resp => console.log('STATUS => ', resp))
    fetch('http://localhost:7333/special_operations', optionsToSend)
        .then(r => r.text())
        .then(resp => console.log('STATUS => ', resp))
    fetch('http://localhost:7334/special_operations', optionsToSend)
        .then(r => r.text())
        .then(resp => console.log('STATUS => ', resp))
    //fetch('http://localhost:7334/special_operations',optionsToSend).then(r=>r.text()).then(resp=>console.log('STATUS => ',resp))
}

// MOVE_FROM_WAITING_ROOM_TO_UNSTAKE()

let acc0Stat = await GET_ACCOUNT_DATA('DELAYED_OPERATIONS')

console.log(acc0Stat)
