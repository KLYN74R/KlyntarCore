/* eslint-disable no-unused-vars */

import { BLOCKCHAIN_DATABASES, GLOBAL_CACHES, WORKING_THREADS } from "../../blockchain_preparation.js"

import { getFromApprovementThreadState } from "../../common_functions/approvement_thread_related.js"

import { getFromState, getUserAccountFromState } from "../../common_functions/state_interactions.js"

import { KLY_EVM } from "../../../../KLY_VirtualMachines/kly_evm/vm.js"



export let CONTRACT_FOR_DELAYED_TRANSACTIONS = {


    /*
    

    delayedTransaction is:

    {
        type:'createStakingPool',
        
        creator: transaction.creator,

        originShard, percentage, poolURL, wssPoolURL
    }
    
    
    */
    createStakingPool:async (threadContext,delayedTransaction) => {

        let {creator,originShard,percentage,poolURL,wssPoolURL} = delayedTransaction

        if(percentage >= 0 && percentage <= 1 && typeof originShard === 'string' && typeof poolURL === 'string' && typeof wssPoolURL === 'string'){

            let contractMetadataTemplate = {

                type:'contract',
                lang:'system/staking/sub',
                balance:0,
                gas:0,
                storages:['POOL'],
                storageAbstractionLastPayment:0

            }

            let onlyOnePossibleStorageForStakingContract = {
                
                percentage,

                totalStakedKly: 0,

                totalStakedUno: 0,

                shard: originShard,

                stakers:{}, // Pubkey => {kly,uno,reward}

                poolURL,

                wssPoolURL

            }

            // Add the pool creator to stakers, but with zero amount of assets => {kly:0,uno:0,reward:0}
            // We need it to send rewards to this special address

            onlyOnePossibleStorageForStakingContract.stakers[creator] = {kly:0,uno:0,reward:0}

            if(threadContext === 'APPROVEMENT_THREAD'){

                let poolAlreadyExists = await BLOCKCHAIN_DATABASES.APPROVEMENT_THREAD_METADATA.get(creator+'(POOL)_STORAGE_POOL').catch(()=>null)

                if(!poolAlreadyExists){

                    // Put storage
                    // NOTE: We just need a simple storage with ID="POOL"
                
                    GLOBAL_CACHES.APPROVEMENT_THREAD_CACHE.set(creator+'(POOL)_STORAGE_POOL',onlyOnePossibleStorageForStakingContract)

                } else return {isOk:false}

            } else {

                let poolAlreadyExists = await BLOCKCHAIN_DATABASES.STATE.get(creator+'(POOL)_POINTER').catch(()=>null)

                if(!poolAlreadyExists){

                    GLOBAL_CACHES.STATE_CACHE.set(creator+'(POOL)_POINTER',originShard)

                    // Put storage
                    // NOTE: We just need a simple storage with ID="POOL"
                    GLOBAL_CACHES.STATE_CACHE.set(originShard+':'+creator+'(POOL)_STORAGE_POOL',onlyOnePossibleStorageForStakingContract)

                    // Put metadata
                    GLOBAL_CACHES.STATE_CACHE.set(originShard+':'+creator+'(POOL)',contractMetadataTemplate)

                } else return {isOk:false}

            }

            return {isOk:true}

        } else return {isOk:false}

    },



    /*
    

    delayedTransaction is:

    {
        type:'updateStakingPool',
        
        creator: transaction.creator,

        originShard, percentage, poolURL, wssPoolURL
    }
    
    */
    updateStakingPool:async (threadContext,delayedTransaction) => {

        let {creator,originShard,percentage,poolURL,wssPoolURL} = delayedTransaction

        if(percentage >=0 && percentage <= 1 && typeof originShard === 'string' && typeof poolURL === 'string' && typeof wssPoolURL === 'string'){

            if(threadContext === 'APPROVEMENT_THREAD'){

                let poolStorage = await getFromApprovementThreadState(creator+'(POOL)_STORAGE_POOL').catch(()=>null)

                if(poolStorage){

                    // Update values

                    poolStorage.percentage = percentage

                    poolStorage.poolURL = poolURL

                    poolStorage.wssPoolURL = wssPoolURL


                } else return {isOk:false}

            } else {

                let shardWherePoolStorageLocated = await BLOCKCHAIN_DATABASES.STATE.get(creator+'(POOL)_POINTER').catch(()=>null)

                let poolStorage = await getFromState(shardWherePoolStorageLocated+':'+creator+'(POOL)_STORAGE_POOL').catch(()=>null)

                if(shardWherePoolStorageLocated && poolStorage){

                    poolStorage.percentage = percentage

                    poolStorage.poolURL = poolURL

                    poolStorage.wssPoolURL = wssPoolURL

                } else return {isOk:false}

            }

            return {isOk:true}

        } else return {isOk:false}

    },


    /*
    
    delayedTransaction is:

    {
        type:'deactivateStakingPool',

        poolPubKey:<Format is Ed25519_pubkey>,
        
        operation:<activate|deactivate>
    }
    
    */
    changePoolActivationStatus:async(threadContext,delayedTransaction) => {

        let {poolPubKey, operation} = delayedTransaction

        let poolStorage

        let shardWherePoolStorageLocated

        if(threadContext === 'APPROVEMENT_THREAD'){

            poolStorage = await getFromApprovementThreadState(poolPubKey+'(POOL)_STORAGE_POOL')

        } else {
        
            shardWherePoolStorageLocated = await getFromState(poolPubKey+'(POOL)_POINTER').catch(()=>null)

            poolStorage = await getFromState(shardWherePoolStorageLocated+':'+poolPubKey+'(POOL)_STORAGE_POOL').catch(()=>null)

        }

        let threadById = threadContext === 'APPROVEMENT_THREAD' ? WORKING_THREADS.APPROVEMENT_THREAD : WORKING_THREADS.VERIFICATION_THREAD

        if(poolStorage){

            if(operation === 'activate'){

                // Check if pool has enough power to be added to pools registry

                if(poolStorage.totalStakedKly >= threadById.NETWORK_PARAMETERS.VALIDATOR_STAKE && !threadById.EPOCH.poolsRegistry.includes(poolPubKey)){

                    threadById.EPOCH.poolsRegistry.push(poolPubKey)

                }

            } else {

                // Just remove the pool from registry

                if(threadById.EPOCH.poolsRegistry.includes(poolPubKey)){

                    let indexOfPool = threadById.EPOCH.poolsRegistry.indexOf(poolPubKey)

                    threadById.EPOCH.poolsRegistry.splice(indexOfPool, 1)

                }

            }


            return {isOk:true}

        } else return {isOk:false,reason:'No such pool'}


    },

    

    /*
    
    delayedTransaction is:

    {
        type:'stake',

        staker: transaction.creator,

        poolPubKey, amount
    }
    
    */
    stake:async(threadContext,delayedTransaction) => {

        let {staker,poolPubKey,amount} = delayedTransaction

        let poolStorage

        let shardWherePoolStorageLocated

        if(threadContext === 'APPROVEMENT_THREAD'){

            poolStorage = await getFromApprovementThreadState(poolPubKey+'(POOL)_STORAGE_POOL')

        } else {
        
            shardWherePoolStorageLocated = await getFromState(poolPubKey+'(POOL)_POINTER').catch(()=>null)

            poolStorage = await getFromState(shardWherePoolStorageLocated+':'+poolPubKey+'(POOL)_STORAGE_POOL').catch(()=>null)

        }

        let threadById = threadContext === 'APPROVEMENT_THREAD' ? WORKING_THREADS.APPROVEMENT_THREAD : WORKING_THREADS.VERIFICATION_THREAD

        let toReturn

        if(poolStorage){

            let amountIsBiggerThanMinimalStake = amount >= threadById.NETWORK_PARAMETERS.MINIMAL_STAKE_PER_ENTITY

            // Here we also need to check if pool is still not fullfilled

            if(amountIsBiggerThanMinimalStake){

                if(!poolStorage.stakers[staker]) poolStorage.stakers[staker] = {kly:0, uno:0, reward:0}

                poolStorage.stakers[staker].kly += amount

                poolStorage.totalStakedKly += amount

                // Check if pool has enough power to be added to pools registry

                if(poolStorage.totalStakedKly >= threadById.NETWORK_PARAMETERS.VALIDATOR_STAKE && !threadById.EPOCH.poolsRegistry.includes(poolPubKey)){

                    threadById.EPOCH.poolsRegistry.push(poolPubKey)

                }

                toReturn = {isOk:true}

            } else toReturn = {isOk:false,reason:'Overview failed'}

        } else toReturn = {isOk:false,reason:'No such pool'}


        if(!toReturn.isOk && shardWherePoolStorageLocated){

            // Return the stake 

            if(staker.startsWith('0x') && staker.length === 42){

                // Return the stake back tp EVM account

                let amountInWei = Math.round(amount * (10 ** 18))

                let recipientAccount = await KLY_EVM.getAccount(staker)

                recipientAccount.balance += BigInt(amountInWei)

                await KLY_EVM.updateAccount(staker,recipientAccount)


            } else {

                let txCreatorAccount = await getUserAccountFromState(shardWherePoolStorageLocated+':'+staker)

                if(txCreatorAccount){
    
                    amount = Number(amount.toFixed(9))
        
                    txCreatorAccount.balance += amount
    
                    txCreatorAccount.balance -= 0.000000001
    
                }    

            }

        }

        return toReturn

    },


    /*
    
    delayedTransaction is:

    {
        type:'unstake',

        unstaker: transaction.creator,

        poolPubKey, amount
    }
    
    */
    unstake:async (threadContext,delayedTransaction) => {

        let {unstaker,poolPubKey,amount} = delayedTransaction

        let poolStorage

        let shardWherePoolStorageLocated


        if(threadContext === 'APPROVEMENT_THREAD'){

            poolStorage = await getFromApprovementThreadState(poolPubKey+'(POOL)_STORAGE_POOL')

        } else {
        
            shardWherePoolStorageLocated = await getFromState(poolPubKey+'(POOL)_POINTER').catch(()=>null)

            poolStorage = await getFromState(shardWherePoolStorageLocated+':'+poolPubKey+'(POOL)_STORAGE_POOL').catch(()=>null)

        }

        if(poolStorage){

            let unstakerAccount = poolStorage.stakers[unstaker]

            if(unstakerAccount){

                let threadById = threadContext === 'APPROVEMENT_THREAD' ? WORKING_THREADS.APPROVEMENT_THREAD : WORKING_THREADS.VERIFICATION_THREAD

                if(unstakerAccount.kly >= amount){

                    unstakerAccount.kly -= amount

                    poolStorage.totalStakedKly -= amount

                    if(unstakerAccount.kly === 0 && unstakerAccount.uno === 0){

                        delete poolStorage.stakers[unstaker] // just to make pool storage more clear

                    }

                    if(threadContext === 'VERIFICATION_THREAD'){

                        // Pay back to staker


                        if(unstaker.startsWith('0x') && unstaker.length === 42){

                            // Return the stake back tp EVM account
            
                            let amountInWei = Math.round(amount * (10 ** 18))
            
                            let unstakerEvmAccount = await KLY_EVM.getAccount(unstaker)
            
                            unstakerEvmAccount.balance += BigInt(amountInWei)
            
                            await KLY_EVM.updateAccount(unstaker,unstakerEvmAccount)
            
            
                        } else {

                            let unstakerAccount = await getFromState(shardWherePoolStorageLocated+':'+unstaker)
    
                            if(unstakerAccount){
        
                                amount = Number(amount.toFixed(9))
    
                                unstakerAccount.balance += amount
    
                                unstakerAccount.balance -= 0.000000001
        
                            }    

                        }
    
                    }

                }

                // Check if pool has not enough power to be at pools registry

                if(poolStorage.totalStakedKly < threadById.NETWORK_PARAMETERS.VALIDATOR_STAKE && threadById.EPOCH.poolsRegistry.includes(poolPubKey)){

                    // Remove from registry

                    let indexOfThisPool = threadById.EPOCH.poolsRegistry.indexOf(poolPubKey)

                    threadById.EPOCH.poolsRegistry.splice(indexOfThisPool, 1)

                }

            } else return {isOk:false,reason:`Impossbile to unstake because tx.creator not a staker`}

        } else return {isOk:false,reason:'No such pool'}

    },


    /*
    

    delayedTransaction is:
    
    {

        type:'changeUnobtaniumAmount',

        targetPool, changesPerAccounts

    }
    
    
    */
    changeUnobtaniumAmount:async (threadContext,delayedTransaction)=>{

        let {targetPool,changesPerAccounts} = delayedTransaction

        let poolStorage

        let shardWherePoolStorageLocated

        if(threadContext === 'APPROVEMENT_THREAD'){

            poolStorage = await getFromApprovementThreadState(targetPool+'(POOL)_STORAGE_POOL')

        } else {
        
            shardWherePoolStorageLocated = await getFromState(targetPool+'(POOL)_POINTER').catch(()=>null)

            poolStorage = await getFromState(shardWherePoolStorageLocated+':'+targetPool+'(POOL)_STORAGE_POOL').catch(()=>null)

        }

        if(poolStorage){

            let generalUnoChange = 0

            for(let [staker,valueOfUno] of Object.entries(changesPerAccounts)){

                if(!poolStorage.stakers[staker]) poolStorage.stakers[staker] = {kly:0, uno:0, reward:0}

                poolStorage.stakers[staker].uno += valueOfUno

                if(poolStorage.stakers[staker].uno < 0) poolStorage.stakers[staker].uno = 0

                if(poolStorage.stakers[staker].kly === 0 && poolStorage.stakers[staker].uno === 0){

                    delete poolStorage.stakers[staker] // just to make pool storage more clear

                }
                
                generalUnoChange += valueOfUno

            }

            // Finally modify the general UNO amount for pool

            poolStorage.totalStakedUno += generalUnoChange
            
            return {isOk:true}

        } else return {isOk:false,reason:'No such pool'}

    }

}