import {BLOCKCHAIN_DATABASES, GLOBAL_CACHES} from '../blockchain_preparation.js'








export let getAccountFromState = async recordID =>{

    return GLOBAL_CACHES.STATE_CACHE.get(recordID) || BLOCKCHAIN_DATABASES.STATE.get(recordID)
    
        .then(account=>{
 
            if(account.type==='account') GLOBAL_CACHES.STATE_CACHE.set(recordID,account)

            return GLOBAL_CACHES.STATE_CACHE.get(recordID)
 
    
        }).catch(()=>false)
 
}




export let getFromState = async recordID => {

    //We get from db only first time-the other attempts will be gotten from ACCOUNTS

    return GLOBAL_CACHES.STATE_CACHE.get(recordID) || BLOCKCHAIN_DATABASES.STATE.get(recordID)
    
        .then(something=>{
 
            GLOBAL_CACHES.STATE_CACHE.set(recordID,something)

            return GLOBAL_CACHES.STATE_CACHE.get(recordID)
 
    
        }).catch(()=>false)

}