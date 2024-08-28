/* eslint-disable no-unused-vars */

import {BLOCKCHAIN_DATABASES,GLOBAL_CACHES,WORKING_THREADS} from '../blockchain_preparation.js'

import {getFromApprovementThreadState} from '../common_functions/approvement_thread_related.js'

import {verifyQuorumMajoritySolution} from '../../../KLY_VirtualMachines/common_modules.js'

import {getFromState} from '../common_functions/state_interactions.js'




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
        params:[

            {
                shard, ed25519PubKey, percentage, overStake, poolURL, wssPoolURL
            }

        ]
        
    Required input params

        [*] shard - shard id to bind pool
        [*] ed25519PubKey - Ed25519 pubkey for validator. The same as PoolID
        [*] percentage - % of fees that will be earned by pubkey related to PoolID. The rest(100%-Percentage) will be shared among stakers
        [*] overStake - number of power(in UNO) allowed to overfill the minimum stake. You need this to prevent deletion from validators pool if your stake are lower than minimum
        [*] poolURL - URL in form http(s)://<domain_or_direct_ip_of_server_cloud_or_smth_like_this>:<port>/<optional_path>
        [*] wssPoolURL - WSS(WebSocket over HTTPS) URL provided by pool for fast data exchange, proofs grabbing, etc.

    */
    createStakingPool:async (threadContext,transaction) => {

        let {shard,ed25519PubKey,percentage,overStake,poolURL,wssPoolURL} = transaction.payload.params[0]

        let poolAlreadyExists = await BLOCKCHAIN_DATABASES.APPROVEMENT_THREAD_METADATA.get(ed25519PubKey+'(POOL)_STORAGE_POOL').catch(()=>null)

        if(!poolAlreadyExists && overStake>=0 && typeof shard === 'string' && typeof poolURL === 'string' && typeof wssPoolURL === 'string'){

            let contractMetadataTemplate = {

                type:'contract',
                lang:'N/A',
                balance:0,
                uno:0,
                gas:0,
                storages:['POOL'],
                bytecode:''

            }

            let onlyOnePossibleStorageForStakingContract = {
                
                percentage,

                overStake,

                poolURL,

                wssPoolURL,

                totalPower:0,
                
                stakers:{} // Pubkey => {kly,uno,reward}

            }

            // Add the pool creator to stakers, but with zero amount of assets => {kly:0,uno:0}
            // We need it to send rewards to this special address

            onlyOnePossibleStorageForStakingContract.stakers[ed25519PubKey] = {kly:0,uno:0,reward:0}

            if(threadContext === 'APPROVEMENT_THREAD'){

                // Put storage
                // NOTE: We just need a simple storage with ID="POOL"
                
                GLOBAL_CACHES.APPROVEMENT_THREAD_CACHE.set(ed25519PubKey+'(POOL)_STORAGE_POOL',onlyOnePossibleStorageForStakingContract)

            } else {

                GLOBAL_CACHES.APPROVEMENT_THREAD_CACHE.set(ed25519PubKey+'(POOL)_POINTER',shard)

                // Put storage
                // NOTE: We just need a simple storage with ID="POOL"
                GLOBAL_CACHES.APPROVEMENT_THREAD_CACHE.set(shard+':'+ed25519PubKey+'(POOL)_STORAGE_POOL',onlyOnePossibleStorageForStakingContract)

                // Put metadata
                GLOBAL_CACHES.APPROVEMENT_THREAD_CACHE.set(shard+':'+ed25519PubKey+'(POOL)',contractMetadataTemplate)

            }

            return {isOk:true}

        } else return {isOk:false}

    },


     /*
     
    Method to delegate your assets to some validator | pool once you have staking ticket

    transaction.payload.params[0] is:

    {
        poolPubKey:<Format is Ed25519_pubkey>,
        randomChallenge,
        amount:<amount in KLY or UNO> | NOTE:must be int - not float
        units:<KLY|UNO>
        quorumAgreements:{

            quorumMemberPubKey1: Signature(`stake:${epochFullID}:${poolPubKey}:${transaction.creator}:${randomChallenge}:${amount}:${units}`),
            ...
            quorumMemberPubKeyN: Signature(`stake:${epochFullID}:${poolPubKey}:${transaction.creator}:${randomChallenge}:${amount}:${units}`)

        }
    }
    
    */
    
    stake:async(threadContext,transaction) => {

        let {poolPubKey,randomChallenge,amount,units,quorumAgreements} = transaction.payload.params[0]

        let poolStorage

        if(threadContext === 'APPROVEMENT_THREAD'){

            poolStorage = await getFromApprovementThreadState(poolPubKey+'(POOL)_STORAGE_POOL')

        } else {
        
            let shardWherePoolStorageLocated = await getFromState(poolPubKey+'(POOL)_POINTER').catch(()=>null)

            poolStorage = await getFromState(shardWherePoolStorageLocated+':'+poolPubKey+'(POOL)_STORAGE_POOL').catch(()=>null)

        }

        let threadById = threadContext === 'APPROVEMENT_THREAD' ? WORKING_THREADS.APPROVEMENT_THREAD : WORKING_THREADS.VERIFICATION_THREAD

        let epochFullID = threadById.EPOCH.hash+'#'+threadById.EPOCH.hash

        // Verify the majority's proof

        let dataThatShouldBeSignedByQuorum = `stake:${epochFullID}:${poolPubKey}:${transaction.creator}:${randomChallenge}:${amount}:${units}`

        let majorityProofIsOk = verifyQuorumMajoritySolution(dataThatShouldBeSignedByQuorum,quorumAgreements)

        // Check if ticket is unspent

        let stakingTicketStillUnspent = await getFromApprovementThreadState(randomChallenge)

        if(majorityProofIsOk && stakingTicketStillUnspent){

            if(poolStorage){

                let amountIsBiggerThanMinimalStake = amount >= threadById.NETWORK_PARAMETERS.MINIMAL_STAKE_PER_ENTITY
 
                let noOverstake = poolStorage.totalPower+poolStorage.overStake <= poolStorage.totalPower + amount

                // Here we also need to check if pool is still not fullfilled

                if(amountIsBiggerThanMinimalStake && noOverstake){

                    if(!poolStorage.stakers[transaction.creator]) poolStorage.stakers[transaction.creator] = {kly:0, uno:0, reward:0}


                    if(units === 'kly'){

                        poolStorage.stakers[transaction.creator].kly += amount

                        poolStorage.totalPower += amount

                    } else {

                        poolStorage.stakers[transaction.creator].uno += amount

                        poolStorage.totalPower += amount

                    }

                    // Check if pool has enough power to be added to pools registry

                    if(poolStorage.totalPower >= threadById.NETWORK_PARAMETERS.VALIDATOR_STAKE && !threadById.EPOCH.poolsRegistry.includes(poolPubKey)){

                        threadById.EPOCH.poolsRegistry.push(poolPubKey)

                    }

                    // Finally, add the appropriate signal to AT storage that this staking ticket was spent
                    // Need it to prevent replay attacks when you burn asset once, but try to stake twice and more
                    
                    GLOBAL_CACHES.APPROVEMENT_THREAD_CACHE.set(randomChallenge,true)

                    return {isOk:true}

                } else return {isOk:false,reason:'Overview failed'}

            } else return {isOk:false,reason:'No such pool'}
            
        } else return {isOk:false,reason:'Majority proof verification failed or staking ticket already used'}

    },


    /*
     
    Method to unstake from pool and get your assets back

    transaction.payload.params[0] is:

    {
        shardToAcceptAssets:<>,
        epochFullID,
        poolToUnstakeFrom:<Format is Ed25519_pubkey>
        amount:<amount in KLY or UNO> | NOTE:must be int - not float
        units:<KLY|UNO>
    }
    
    */
    unstake:async (threadContext,transaction) => {

        let {shardToAcceptAssets,epochFullID,poolToUnstakeFrom,amount,units} = transaction.payload.params[0]

        let poolStorage

        if(threadContext === 'APPROVEMENT_THREAD'){

            poolStorage = await getFromApprovementThreadState(poolToUnstakeFrom+'(POOL)_STORAGE_POOL')

        } else {
        
            let shardWherePoolStorageLocated = await getFromState(poolToUnstakeFrom+'(POOL)_POINTER').catch(()=>null)

            poolStorage = await getFromState(shardWherePoolStorageLocated+':'+poolToUnstakeFrom+'(POOL)_STORAGE_POOL').catch(()=>null)

        }

        if(poolStorage && (units === 'kly' || units === 'uno')){

            if(poolStorage.stakers[transaction.creator]){

                let threadById = threadContext === 'APPROVEMENT_THREAD' ? WORKING_THREADS.APPROVEMENT_THREAD : WORKING_THREADS.VERIFICATION_THREAD

                let realEpochFullID = threadById.EPOCH.hash+'#'+threadById.EPOCH.hash

                if(realEpochFullID === epochFullID){

                    if(poolStorage.stakers[transaction.creator][units] >= amount){

                        poolStorage.stakers[transaction.creator][units] -= amount
    
                        poolStorage.totalPower -= amount
    
                        if(poolStorage.stakers[transaction.creator].kly === 0 && poolStorage.stakers[transaction.creator].uno === 0){
    
                            delete poolStorage.stakers[transaction.creator] // just to make pool storage more clear
    
                        }
    
                        if(threadContext === 'VERIFICATION_THREAD'){
    
                            // Pay back to staker
        
                            let unstakerAccount = await getFromState(shardToAcceptAssets+':'+transaction.creator)
        
                            if(unstakerAccount){
        
                                if(units === 'kly') unstakerAccount.balance += amount
        
                                else if(units === 'uno') unstakerAccount.uno += amount
        
                            }
        
                        }    
    
                    }
    
                    // Check if pool has not enough power to be at pools registry
    
                    if(poolStorage.totalPower < threadById.NETWORK_PARAMETERS.VALIDATOR_STAKE && threadById.EPOCH.poolsRegistry.includes(poolToUnstakeFrom)){
    
                        // Remove from registry
    
                        let indexOfThisPool = threadById.EPOCH.poolsRegistry.indexOf(poolToUnstakeFrom)
    
                        threadById.EPOCH.poolsRegistry.splice(indexOfThisPool, 1)
    
                        // ... and in case tx is runned in VERIFICATION_THREAD context - remove pool from VERIFICATION_STATS_PER_POOL
                        
                        if(threadContext === 'VERIFICATION_THREAD'){
    
                            delete WORKING_THREADS.VERIFICATION_THREAD[poolToUnstakeFrom]
                            
                        }
    
                    }

                } else return {isOk:false,reason:'Replay attack detection. Attempt to unstake in different epoch'}

            } else return {isOk:false,reason:`Impossbile to unstake because tx.creator not a staker`}

        } else return {isOk:false,reason:'No such pool'}

    },


    /*

        Method that should be executed only on VT(VERFICATION_THREAD) because only on VT you can spent coins(rewards) and no sense in it on APPROVEMENT_THREAD
    
        {
            poolToGetRewardsFrom:<Format is Ed25519_pubkey>
        }
    
    */
    getRewardFromPool:async(threadContext,transaction) => {

        let {poolToGetRewardsFrom} = transaction.payload.params[0]

        let shardWherePoolStorageLocated = await getFromState(poolToGetRewardsFrom+'(POOL)_POINTER').catch(()=>null)

        let poolStorage = await getFromState(shardWherePoolStorageLocated+':'+poolToGetRewardsFrom+'(POOL)_STORAGE_POOL').catch(()=>null)

        // You will be rewarded on the same shard where you made a stake on pool

        let accountOfStakerToReceiveRewards = await getFromState(shardWherePoolStorageLocated+':'+transaction.creator).catch(()=>null)


        if(poolStorage && accountOfStakerToReceiveRewards && poolStorage.stakers[transaction.creator]){

            if(threadContext === 'VERIFICATION_THREAD'){

                accountOfStakerToReceiveRewards.balance += poolStorage.stakers[transaction.creator].reward

                poolStorage.stakers[transaction.creator].reward = 0

            }

        } else return {isOk:false,reason:`Impossbile to unstake because tx.creator not a staker or pool does not exist`}

    },


    slashing:async(threadContext,transaction) => {

        // Need quorum majority agreements here

    },

    reduceAmountOfUno:async(threadContext,transaction) => {

        // Need quorum majority agreements here

    }

}