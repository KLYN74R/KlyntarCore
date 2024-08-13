import {getAccountFromState, getFromState} from '../common_functions/state_interactions.js'

import {BLOCKCHAIN_DATABASES, WORKING_THREADS} from '../blockchain_preparation.js'

import {blake3Hash} from '../../../KLY_Utils/utils.js'




export let GAS_USED_BY_METHOD=methodID=>{

    if(methodID==='constructor') return 10000

    else if(methodID==='stake') return 10000

    else if(methodID==='unstake') return 10000

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
                shard, ed25519PubKey, percentage, overStake, whiteList, poolURL, wssPoolURL
            }

        ]
        
    Required input params

        [*] shard - shard id to bind pool
        [*] ed25519PubKey - Ed25519 pubkey for validator. The same as PoolID
        [*] percentage - % of fees that will be earned by pubkey related to PoolID. The rest(100%-Percentage) will be shared among stakers
        [*] overStake - number of power(in UNO) allowed to overfill the minimum stake. You need this to prevent deletion from validators pool if your stake are lower than minimum
        [*] whiteList - array of addresses who can invest in this pool. Thanks to this, you can set own logic to distribute fees,make changes and so on by adding only one address - ID of smart contract
        [*] poolURL - URL in form http(s)://<domain_or_direct_ip_of_server_cloud_or_smth_like_this>:<port>/<optional_path>
        [*] wssPoolURL - WSS(WebSocket over HTTPS) URL provided by pool for fast data exchange, proofs grabbing, etc.

    */
    createStakingPool:async (threadContext,transaction,atomicBatch) => {

        let {shard,ed25519PubKey,percentage,overStake,whiteList,poolURL,wssPoolURL} = transaction.payload.params[0]

        let poolAlreadyExists = await BLOCKCHAIN_DATABASES.APPROVEMENT_THREAD_METADATA.get(ed25519PubKey+'(POOL)_STORAGE_POOL').catch(()=>null)

        if(!poolAlreadyExists && overStake>=0 && Array.isArray(whiteList) && typeof shard === 'string' && typeof poolURL === 'string' && typeof wssPoolURL === 'string'){

            let contractMetadataTemplate = {

                type:'contract',
                lang:'system/staking',
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

                whiteList,

                totalPower:0, // KLY(converted to UNO by WORKFLOW_OPTIONS.VALIDATOR_STAKE_RATIO) + UNO. Must be greater than WORKFLOW_OPTIONS.VALIDATOR_STAKE
                
                stakers:{} // Pubkey => {kly,uno}

            }

            if(threadContext === 'AT'){

                // Put storage
                // NOTE: We just need a simple storage with ID="POOL"
                
                atomicBatch.put(ed25519PubKey+'(POOL)_STORAGE_POOL',onlyOnePossibleStorageForStakingContract)

            } else {

                atomicBatch.put(ed25519PubKey+'(POOL)_POINTER',shard)

                // Put storage
                // NOTE: We just need a simple storage with ID="POOL"
                atomicBatch.put(shard+':'+ed25519PubKey+'(POOL)_STORAGE_POOL',onlyOnePossibleStorageForStakingContract)

                // Put metadata
                atomicBatch.put(shard+':'+ed25519PubKey+'(POOL)',contractMetadataTemplate)

            }

            return {isOk:true}

        } else return {isOk:false}

    },


    /*
    
        Method to burn KLY / UNO to make it possible to stake on some pool

        transaction.payload.params[0] is:

        {
            fullPoolIdWithPostfix:<Format is Ed25519_pubkey(POOL)>,
            recipientNextNonce:<next nonce of target address - need it to prevent replay attacks>,
            amount:<amount in KLY or UNO> | NOTE:must be int - not float
            units:<KLY|UNO>
        }
    
    */
    burnAssetsToGetStakingTicket:async (originShard,transaction)=>{

        let txCreatorAccount = await getAccountFromState(originShard+':'+transaction.creator)

        let {fullPoolIdWithPostfix,recipientNextNonce,amount,units} = transaction.payload.params[0]


        if(txCreatorAccount && typeof fullPoolIdWithPostfix === 'string' && typeof recipientNextNonce === 'number' && typeof units === 'string' && typeof amount === 'number' && amount <= txCreatorAccount.balance){

            if(units === 'kly') txCreatorAccount.balance -= amount

            else txCreatorAccount.uno -= amount

            return {isOk:true, extraData:{fullPoolIdWithPostfix,recipient:transaction.creator,recipientNextNonce,amount,units}}

        } else return {isOk:false, reason:'No such account or wrong input to function of contract'}

    },

    /*
     
    Method to delegate your assets to some validator | pool once you have staking ticket

    transaction.payload.params[0] is:

    {
        fullPoolIdWithPostfix:<Format is Ed25519_pubkey(POOL)>
        amount:<amount in KLY or UNO> | NOTE:must be int - not float
        units:<KLY|UNO>
        quorumAgreements:{

            quorumMemberPubKey1: Signature(`stake:${fullPoolIdWithPostfix}:${amountUno}:${action}:${transaction.nonce}`),
            ...
            quorumMemberPubKeyN: Signature(moveToShard+recipient+recipientNextNonce+amount)

        }
    }
    
    */
    
    stake:async(threadContext,transaction) => {

        let {fullPoolIdWithPostfix,amount,units} = transaction.payload.params[0]

        let poolStorage

        if(threadContext === 'AT'){

            poolStorage = await BLOCKCHAIN_DATABASES.APPROVEMENT_THREAD_METADATA.get(fullPoolIdWithPostfix+'_STORAGE_POOL')

        } else {
        
            let shardWherePoolStorageLocated = await BLOCKCHAIN_DATABASES.STATE.get(fullPoolIdWithPostfix+'_POINTER').catch(()=>null)

            poolStorage = await BLOCKCHAIN_DATABASES.STATE.get(shardWherePoolStorageLocated+':'+fullPoolIdWithPostfix+'_STORAGE_POOL').catch(()=>null)

        }


        // Here we also need to check if pool is still not fullfilled
        // Also, instantly check if account is whitelisted

        if(poolStorage && (poolStorage.whiteList.length===0 || poolStorage.whiteList.includes(transaction.creator))){

            let stakerAccount = await getAccountFromState(originShard+':'+transaction.creator)

            if(stakerAccount){

                
                let hasEnough = amount <= (units==='kly' ? stakerAccount.balance : stakerAccount.uno)

                let amountIsBiggerThanMinimalStake = amount >= WORKING_THREADS.VERIFICATION_THREAD.WORKFLOW_OPTIONS.MINIMAL_STAKE_PER_ENTITY

                let stakeIsOk = hasEnough && amountIsBiggerThanMinimalStake

                // Make overview verification

                let workflowConfigs = WORKING_THREADS[threadContext].WORKFLOW_OPTIONS
    
                let isMinimalRequiredAmount = amount >= workflowConfigs.MINIMAL_STAKE_PER_ENTITY
            
                let ifStakeCheck = poolStorage.totalPower+poolStorage.overStake <= poolStorage.totalPower+amount
            
                
                let overviewIsOk = isMinimalRequiredAmount && inWaitingRoomTheSameAsInPayload && ifStakeCheck
            

                if(stakeIsOk && poolStorage.totalPower + amount <= poolStorage.overStake+WORKING_THREADS.VERIFICATION_THREAD.WORKFLOW_OPTIONS.VALIDATOR_STAKE){

                    poolStorage.waitingRoom[blake3Hash(transaction.sig)]={

                        epochID:WORKING_THREADS.VERIFICATION_THREAD.EPOCH.id,

                        staker:transaction.creator,

                        amount,

                        units,

                        type:'+' //means "STAKE"
                    
                    }

                    // Reduce number of KLY/UNO from account
                    if(units==='kly') stakerAccount.balance-=amount
                    
                    else stakerAccount.uno-=amount

                    return {isOk:true}

                } else return {isOk:false}

            } else return {isOk:false}
    
        } else return {isOk:false}

    },


    /*
     
        Method to delegate your assets to some validator | pool

        transaction.payload.params[0] is:

        {
            fullPoolIdWithPostfix:<Format is Ed25519_pubkey(POOL)>
            amount:<amount in KLY or UNO> | NOTE:must be int - not float
            type:<KLY|UNO>
        }

    
    */
    unstake:async (threadContext,transaction) => {

        let {fullPoolIdWithPostfix,amount,units} = transaction.payload.params[0],

            poolStorage = await getFromState(originShard+':'+fullPoolIdWithPostfix+'_STORAGE_POOL'),

            stakerInfo = poolStorage.stakers[transaction.creator], // Pubkey => {kly,uno}

            wishedUnstakingAmountIsOk = stakerInfo[units==='kly'?'kly':'uno'] >= amount


        if(poolStorage && wishedUnstakingAmountIsOk){

            poolStorage.waitingRoom[blake3Hash(transaction.sig)]={

                epochID:WORKING_THREADS.VERIFICATION_THREAD.EPOCH.id,

                staker:transaction.creator,

                amount,

                units,

                type:'-' //means "UNSTAKE"

            }

            return {isOk:true}
    
        } else return {isOk:false, reason: 'No such pool or you try to unstake more than you allowed'}

    },


    slashing:async(threadContext,transaction) => {



    }
        
}