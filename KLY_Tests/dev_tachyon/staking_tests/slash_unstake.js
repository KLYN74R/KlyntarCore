/*

This is the set of tests related to SLASH_UNSTAKE and REMOVE_FROM_WAITING_ROOM special operations

[+] SLASH_UNSTAKE

This is the operation which burn the stake of pool(and stakers) and remove it from POOLS_METADATA, QUORUM and so on.

We need to send the appropriate object to current quorum members

    {
        pool:<BLS pubkey - id of rogue pool>
        delayedIds - array of IDs of delayed operations to get it and remove "UNSTAKE" txs from state
    }

___________________________________Let's clear up___________________________________

0) Rogue pool after a detected malicious behaviour have ability to quickly <UNSTAKE> own KLY or UNO to save own stake.

(hence staking is allowed, separate stakers can do the same)

1) Insofar as we want to "slash" this unstaking we need to understand how unstaking process works


_____________________________________Unstaking______________________________________

0) Initially, staker call the "unstake()" method of his pool where his stake freezed.

After that, if it's allowed - WAITING_ROOM of pool will looks like this


    WAITING_ROOM: {

        '<BLAKE3(tx.sig)>':

            checkpointID:global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.id
    
            staker:'7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u'
    
            amount:X
    
            units:'KLY'
    
            type:'-' //means "UNSTAKE
    
        }

    }


1) After calling special operation, his unstake moves to DELAYED_OPERATIONS and marked with id of current checkpoint


[DEL_OPER_1337] - array of delayed operations for checkpoint 1337

[

    {

        fromPool:'7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u',

        to:'7bWUpRvRZPQ4QiPVCZ6iKLK9VaUzyzatdxdKbF6iCvgFA1CwfF6694G1K2wyLMT55u',
                        
        amount:X,
                        
        units:'KLY'

    },
    ...(other delayed operations from checkpoint 1337th)

]


2) There are also arrays DEL_OPER_X, DEL_OPER_Y and so on where X,Y and so on - the ID of checkpoint

3) Thanks to <fromPool> property we can easily go through objects in these arrays and delete object where pool is equal to our rogue pool


_____________________________________Summary______________________________________

So, in our special operation 

    {
        pool:<BLS pubkey - id of rogue pool>
        delayedIds - array of IDs of delayed operations to get it and remove "UNSTAKE" txs from state
    }

    delayedIds may looks like this: [56,57,60,....]

    In human language it's like command: "Go over DEL_OPER_56, DEL_OPER_57, DEL_OPER_60 and find unstakes where <pool> === <fromPool> property and delete(slash,burn) it"

    

*/


import bls from '../../../KLY_Utils/signatures/multisig/bls.js'
import {ED25519_SIGN_DATA} from '../../../KLY_Utils/utils.js'
import fetch from 'node-fetch'




//___________________________________________ CONSTANTS POOL ___________________________________________




const SYMBIOTE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' //chain on which you wanna send tx

const WORKFLOW_VERSION = 0

const FEE = 5


const TRUSTED_KEY_PAIR={

    mnemonic:'dumb museum put goose obvious pipe provide series region hold morning cash',
    bip44Path:"m/44'/7331'/0'/0'",
    pub:'6BT43SvoKHPfzVuuMNCUTFs15iaRryJ3sARNrSc8NdA9',
    prv:'MC4CAQAwBQYDK2VwBCIEIN8gl2IaD82ox9efz/Ww14/S//5cfd7/sTUwzBenz7Xu'
  
}



let SEND_SLASH_UNSTAKE_SPECIAL_OPERATION=async()=>{


    let data = {

        pool:'75XPnpDxrAtyjcwXaATfDhkYTGBoHuonDU1tfqFc6JcNPf5sgtcsvBRXaXZGuJ8USG',
        delayedIds:[0]

    }


    let mySpecialOperationToSlashUnstake = {

        type:'SLASH_UNSTAKE',
        
        payload:{

            sigType:'D',
            pubKey:TRUSTED_KEY_PAIR.pub,
            data,
            signa:await ED25519_SIGN_DATA(JSON.stringify(data)+'',TRUSTED_KEY_PAIR.prv)
    
        }
    
    }


    let optionsToSend = {

        method:'POST',
        body:JSON.stringify(mySpecialOperationToSlashUnstake)
    
    }


    console.log('============ SLASH_UNSTAKE ============')
    
    console.log(mySpecialOperationToSlashUnstake)
    
    fetch('http://localhost:7331/special_operations',optionsToSend).then(r=>r.text()).then(resp=>console.log('STATUS => ',resp))
    fetch('http://localhost:7332/special_operations',optionsToSend).then(r=>r.text()).then(resp=>console.log('STATUS => ',resp))
    fetch('http://localhost:7333/special_operations',optionsToSend).then(r=>r.text()).then(resp=>console.log('STATUS => ',resp))


}

SEND_SLASH_UNSTAKE_SPECIAL_OPERATION()



let SEND_REMOVE_FROM_WAITING_ROOM_SPECIAL_OPERATION=async()=>{


    const GENESIS_VALIDATOR_3 = {

        privateKey:"aa73f1798339b56fbf9a7e8e73b69a2e0e8d71dcaa9d9d114c6bd467d79d5d24",

        pubKey:"61TXxKDrBtb7bjpBym8zS9xRDoUQU6sW9aLvvqN9Bp9LVFiSxhRPd9Dwy3N3621RQ8"

    
    }

    let data = {

        pool:GENESIS_VALIDATOR_3.pubKey,
        txid:'f264c0454364971238410e81c05368e23fb63d66665808f527c0c9462a921181'

    }


    let mySpecialOperationToRemoveFromWR = {

        type:'REMOVE_FROM_WAITING_ROOM',
        
        payload:data
    
    }


    let optionsToSend = {

        method:'POST',
        body:JSON.stringify(mySpecialOperationToRemoveFromWR)
    
    }


    console.log('============ REMOVE_FROM_WAITING_ROOM ============')
    
    console.log(mySpecialOperationToRemoveFromWR)
    
    fetch('http://localhost:7331/special_operations',optionsToSend).then(r=>r.text()).then(resp=>console.log('STATUS => ',resp))
    fetch('http://localhost:7332/special_operations',optionsToSend).then(r=>r.text()).then(resp=>console.log('STATUS => ',resp))
    fetch('http://localhost:7333/special_operations',optionsToSend).then(r=>r.text()).then(resp=>console.log('STATUS => ',resp))


}


// SEND_REMOVE_FROM_WAITING_ROOM_SPECIAL_OPERATION()