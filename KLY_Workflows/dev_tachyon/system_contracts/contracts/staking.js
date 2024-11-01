/* eslint-disable no-unused-vars */

import {getFromState, getUserAccountFromState} from '../../common_functions/state_interactions.js'

import {GLOBAL_CACHES,WORKING_THREADS} from '../../blockchain_preparation.js'




export let gasUsedByMethod=methodID=>{

    if(methodID==='createStakingPool') return 10000

    else if(methodID==='stake') return 10000

    else if(methodID==='unstake') return 10000

    else if(methodID==='slashing') return 10000

    else if(methodID==='reduceAmountOfUno') return 10000

}




export let CONTRACT = {

     /*
    
    Used by pool creators to create contract instance and a storage "POOL"

    transaction.payload is
    
    {
        contractID:'system/staking',
        method:'createStakingPool',
        gasLimit:0,
        imports:[],
        params:{
            percentage, overStake, poolURL, wssPoolURL
        }
        
    Required input params

        [*] percentage - % of fees that will be earned by pubkey related to PoolID. The rest(100%-Percentage) will be shared among stakers
        [*] overStake - number of power allowed to overfill the minimum stake. You need this to prevent deletion from validators pool if your stake are lower than minimum
        [*] poolURL - URL in form http(s)://<domain_or_direct_ip_of_server_cloud_or_smth_like_this>:<port>/<optional_path>
        [*] wssPoolURL - WSS(WebSocket over HTTPS) URL provided by pool for fast data exchange, proofs grabbing, etc.

    */
    createStakingPool:async (originShard,transaction) => {

        let {percentage,overStake,poolURL,wssPoolURL} = transaction.payload.params

        if(overStake >= 0 && percentage >= 0 && typeof poolURL === 'string' && typeof wssPoolURL === 'string'){

            // Get the array of delayed operations

            let overNextEpochIndex = WORKING_THREADS.VERIFICATION_THREAD.EPOCH.id+2

            let delayedTransactions = await getFromState(`DELAYED_TRANSACTIONS:${overNextEpochIndex}:${originShard}`) // should be array of delayed operations

            if(!Array.isArray(delayedTransactions)){

                delayedTransactions = []

            }

            let templateToPush = {

                type:'createStakingPool',

                creator: transaction.creator,

                originShard, percentage, overStake, poolURL, wssPoolURL

            }

            delayedTransactions.push(templateToPush)

            GLOBAL_CACHES.STATE_CACHE.set(`DELAYED_TRANSACTIONS:${overNextEpochIndex}:${originShard}`,delayedTransactions)

            return {isOk:true}

        } else return {isOk:false, reason: `Failed with input verification`}

    },


    /*
    
    Method to stake to some pool that exists

    transaction.payload.params is:

    {
        poolPubKey:<Format is Ed25519_pubkey>,
        amount:<amount in KLY or UNO> | NOTE:must be int - not float,
        units:<KLY|UNO>
    }
    
    */
    
    stake:async(originShard,transaction) => {

        let txCreatorAccount = await getUserAccountFromState(originShard+':'+transaction.creator)

        let {poolPubKey,amount,units} = transaction.payload.params

        if(txCreatorAccount && typeof poolPubKey === 'string' && typeof units === 'string' && typeof amount === 'number'){
            
            if(units === 'kly' && amount <= txCreatorAccount.balance){

                amount = Number(amount.toFixed(9))

                txCreatorAccount.balance -= amount

                txCreatorAccount.balance -= 0.000000001

            } 

            else if (units === 'uno' && amount <= txCreatorAccount.uno){

                amount = Number(amount.toFixed(9))

                txCreatorAccount.uno -= amount

                txCreatorAccount.uno -= 0.000000001

            }

            // Now add it to delayed operations

            let overNextEpochIndex = WORKING_THREADS.VERIFICATION_THREAD.EPOCH.id+2

            let delayedTransactions = await getFromState(`DELAYED_TRANSACTIONS:${overNextEpochIndex}:${originShard}`) // should be array of delayed operations

            if(!Array.isArray(delayedTransactions)){

                delayedTransactions = []

            }

            let templateToPush = {

                type:'stake',

                staker: transaction.creator,

                poolPubKey,amount,units

            }

            delayedTransactions.push(templateToPush)

            GLOBAL_CACHES.STATE_CACHE.set(`DELAYED_TRANSACTIONS:${overNextEpochIndex}:${originShard}`,delayedTransactions)

            return {isOk:true}

        } else return {isOk:false, reason: `Failed with input verification`}

    },


    /*
     
    Method to unstake from pool and get your assets back

    transaction.payload.params is:

    {
        poolPubKey:<Format is Ed25519_pubkey>,
        amount:<amount in KLY or UNO> | NOTE:must be int - not float,
        units:<KLY|UNO>
    }
    
    */
    unstake:async (originShard,transaction) => {

        let txCreatorAccount = await getUserAccountFromState(originShard+':'+transaction.creator)

        let {poolPubKey,amount,units} = transaction.payload.params

        if(txCreatorAccount && typeof poolPubKey === 'string' && typeof units === 'string' && typeof amount === 'number'){

            // Now add it to delayed operations

            let overNextEpochIndex = WORKING_THREADS.VERIFICATION_THREAD.EPOCH.id+2

            let delayedTransactions = await getFromState(`DELAYED_TRANSACTIONS:${overNextEpochIndex}:${originShard}`) // should be array of delayed operations

            if(!Array.isArray(delayedTransactions)){

                delayedTransactions = []

            }

            let templateToPush = {

                type:'unstake',

                unstaker: transaction.creator,

                poolPubKey,amount,units

            }

            delayedTransactions.push(templateToPush)

            GLOBAL_CACHES.STATE_CACHE.set(`DELAYED_TRANSACTIONS:${overNextEpochIndex}:${originShard}`,delayedTransactions)

            return {isOk:true}

        } else return {isOk:false, reason: `Failed with input verification`}
 
    },


    /*

        Method that should be executed only on VT(VERFICATION_THREAD) because only on VT you can spent coins(rewards) and no sense in it on APPROVEMENT_THREAD
    
        {
            poolToGetRewardsFrom:<Format is Ed25519_pubkey>
        }
    
    */
    getRewardFromPool:async(originShard,transaction) => {

        let txCreatorAccount = await getUserAccountFromState(originShard+':'+transaction.creator)

        let {poolToGetRewardsFrom} = transaction.payload.params

        if(txCreatorAccount && typeof poolToGetRewardsFrom === 'string'){

            // Now add it to delayed operations

            let overNextEpochIndex = WORKING_THREADS.VERIFICATION_THREAD.EPOCH.id+2

            let delayedTransactions = await getFromState(`DELAYED_TRANSACTIONS:${overNextEpochIndex}:${originShard}`) // should be array of delayed operations

            if(!Array.isArray(delayedTransactions)){

                delayedTransactions = []

            }

            let templateToPush = {

                type:'getRewardFromPool',

                rewardRecipient: transaction.creator,

                poolToGetRewardsFrom


            }

            delayedTransactions.push(templateToPush)

            GLOBAL_CACHES.STATE_CACHE.set(`DELAYED_TRANSACTIONS:${overNextEpochIndex}:${originShard}`,delayedTransactions)

            return {isOk:true}

        } else return {isOk:false, reason: `Failed with input verification`}
 
    }

    
    // slashing:async(originShard,transaction) => {


    // },

    // reduceAmountOfUno:async(originShard,transaction) => {


    // }

}