import bls from '../../KLY_Utils/signatures/multisig/bls.js'
import {ED25519_SIGN_DATA} from '../../KLY_Utils/utils.js'
import fetch from 'node-fetch'




const TRUSTED_KEY_PAIR={

    mnemonic:'dumb museum put goose obvious pipe provide series region hold morning cash',
    bip44Path:"m/44'/7331'/0'/0'",
    pub:'6BT43SvoKHPfzVuuMNCUTFs15iaRryJ3sARNrSc8NdA9',
    prv:'MC4CAQAwBQYDK2VwBCIEIN8gl2IaD82ox9efz/Ww14/S//5cfd7/sTUwzBenz7Xu'
  
}




let SEND_VERSION_UPDATE_MESSAGE=async()=>{


    /*
    
    
    If received from route - then payload has the following structure

        {
            sigType,
            pubKey,
            signa,
            data:{
                major:<typeof Number>
            }
        }

        Also, you must sign the data with the latest payload's header hash

        SIG(JSON.stringify(data)+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.HASH)
    
    
    */

    let data = {major:1}


    let mySpecialOperationToUpdateVersion = {

        type:'VERSION_UPDATE',
        
        payload:{

            sigType:'D',
            pubKey:TRUSTED_KEY_PAIR.pub,
            data,
            signa:await ED25519_SIGN_DATA(JSON.stringify(data)+'',TRUSTED_KEY_PAIR.prv)
    
        }
    
    }


    let optionsToSend = {

        method:'POST',
        body:JSON.stringify(mySpecialOperationToUpdateVersion)
    
    }


    console.log('============ VERSION UPDATE ============')
    
    console.log(mySpecialOperationToUpdateVersion)
    
    fetch('http://localhost:7331/special_operations',optionsToSend).then(r=>r.text()).then(resp=>console.log('STATUS => ',resp))
    fetch('http://localhost:7332/special_operations',optionsToSend).then(r=>r.text()).then(resp=>console.log('STATUS => ',resp))
    fetch('http://localhost:7333/special_operations',optionsToSend).then(r=>r.text()).then(resp=>console.log('STATUS => ',resp))


}





let SEND_WORKFLOW_UPDATE_MESSAGE=async()=>{

    
    /*
    
     If received from route - then payload has the following structure

        {
            sigType,
            pubKey,
            signa,
            data:{
                fieldName
                newValue
            }
        }

        *data - object with the new option(proposition) for WORKFLOW_OPTIONS

        Also, you must sign the data with the latest payload's header hash

        SIG(JSON.stringify(data)+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.HASH)
        
    
    */

        let data={

            fieldName:'SUBCHAIN_AFK_LIMIT',
            newValue:130000
        
        }
    
        let mySpecialOperationToUpdateWorkflow = {

            type:'WORKFLOW_UPDATE',
            
            payload:{
    
                sigType:'D',
                pubKey:TRUSTED_KEY_PAIR.pub,
                data,
                signa:await ED25519_SIGN_DATA(JSON.stringify(data)+'',TRUSTED_KEY_PAIR.prv)
        
            }
        
        }
    


    let optionsToSend = {

        method:'POST',
        body:JSON.stringify(mySpecialOperationToUpdateWorkflow)
    
    }


    console.log('============ WORKFLOW UPDATE ============')
    
    console.log(mySpecialOperationToUpdateWorkflow)
    
    
    fetch('http://localhost:7331/special_operations',optionsToSend).then(r=>r.text()).then(resp=>console.log('STATUS => ',resp))
    fetch('http://localhost:7332/special_operations',optionsToSend).then(r=>r.text()).then(resp=>console.log('STATUS => ',resp))
    fetch('http://localhost:7333/special_operations',optionsToSend).then(r=>r.text()).then(resp=>console.log('STATUS => ',resp))
    //fetch('http://localhost:7334/special_operations',optionsToSend).then(r=>r.text()).then(resp=>console.log('STATUS => ',resp))

}




let SEND_RUBICON_UPDATE_MESSAGE=async()=>{


    /*
    
     If received from route - then payload has the following structure

            {
                sigType,
                pubKey,
                signa,
                data - new value of RUBICON
            }


        *data - new value of RUBICON for appropriate thread

        Also, you must sign the data with the latest payload's header hash

        SIG(data+SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.HEADER.HASH)

    
    */

        let data = 0
    
        let mySpecialOperationToUpdateRubicon = {

            type:'RUBICON_UPDATE',
            
            payload:{
    
                sigType:'D',
                pubKey:TRUSTED_KEY_PAIR.pub,
                data,
                signa:await ED25519_SIGN_DATA(data+'',TRUSTED_KEY_PAIR.prv)
        
            }
        
        }
    


    let optionsToSend = {

        method:'POST',
        body:JSON.stringify(mySpecialOperationToUpdateRubicon)
    
    }

    console.log('============ RUBICON UPDATE ============')
    
    console.log(mySpecialOperationToUpdateRubicon)
    
    
    fetch('http://localhost:7331/special_operations',optionsToSend).then(r=>r.text()).then(resp=>console.log('STATUS => ',resp))
    fetch('http://localhost:7332/special_operations',optionsToSend).then(r=>r.text()).then(resp=>console.log('STATUS => ',resp))
    fetch('http://localhost:7333/special_operations',optionsToSend).then(r=>r.text()).then(resp=>console.log('STATUS => ',resp))
    //fetch('http://localhost:7334/special_operations',optionsToSend).then(r=>r.text()).then(resp=>console.log('STATUS => ',resp))

}






let SEND_REMOVE_FROM_WAITING_MESSAGE=async()=>{

    /*
    
    Payload is {txid,pool}

    Imagine that WAITING_ROOM of some pool looks like this

    
    */

    
    let mySpecialOperationToRemoveFromWaitingRoom = {

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
        body:JSON.stringify(mySpecialOperationToRemoveFromWaitingRoom)
    
    }
    
    
    // fetch('http://localhost:7331/special_operations',optionsToSend).then(r=>r.text()).then(resp=>console.log('STATUS => ',resp))
    // fetch('http://localhost:7332/special_operations',optionsToSend).then(r=>r.text()).then(resp=>console.log('STATUS => ',resp))
    // fetch('http://localhost:7333/special_operations',optionsToSend).then(r=>r.text()).then(resp=>console.log('STATUS => ',resp))
    //fetch('http://localhost:7334/special_operations',optionsToSend).then(r=>r.text()).then(resp=>console.log('STATUS => ',resp))

}




let SEND_SLASH_UNSTAKE_MESSAGE=async()=>{


    /*
    
        Payload is {delayedIds,pool}
    
    */

    
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
    
    
    // fetch('http://localhost:7331/special_operations',optionsToSend).then(r=>r.text()).then(resp=>console.log('STATUS => ',resp))
    // fetch('http://localhost:7332/special_operations',optionsToSend).then(r=>r.text()).then(resp=>console.log('STATUS => ',resp))
    // fetch('http://localhost:7333/special_operations',optionsToSend).then(r=>r.text()).then(resp=>console.log('STATUS => ',resp))
    //fetch('http://localhost:7334/special_operations',optionsToSend).then(r=>r.text()).then(resp=>console.log('STATUS => ',resp))

}


SEND_VERSION_UPDATE_MESSAGE()

// SEND_WORKFLOW_UPDATE_MESSAGE()

// SEND_RUBICON_UPDATE_MESSAGE()