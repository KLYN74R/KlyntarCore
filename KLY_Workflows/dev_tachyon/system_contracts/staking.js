/* eslint-disable no-unused-vars */
import {getFromApprovementThreadState} from '../common_functions/approvement_thread_related.js'

import {getAccountFromState, getFromState} from '../common_functions/state_interactions.js'

import {verifyQuorumMajoritySolution} from '../../../KLY_VirtualMachines/common_modules.js'

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
            poolPubKey:<Format is Ed25519>,
            recipientNextNonce:<next nonce of target address - need it to prevent replay attacks>,
            amount:<amount in KLY or UNO> | NOTE:must be int - not float
            units:<KLY|UNO>
        }
    
    */
    burnAssetsToGetStakingTicket:async (originShard,transaction)=>{

        let txCreatorAccount = await getAccountFromState(originShard+':'+transaction.creator)

        let {poolPubKey,recipientNextNonce,amount,units} = transaction.payload.params[0]


        if(txCreatorAccount && typeof poolPubKey === 'string' && typeof recipientNextNonce === 'number' && typeof units === 'string' && typeof amount === 'number' && amount <= txCreatorAccount.balance){

            
            if(units === 'kly' && amount <= txCreatorAccount.balance) txCreatorAccount.balance -= amount

            else if (units === 'uno' && amount <= txCreatorAccount.uno) txCreatorAccount.uno -= amount


            return {isOk:true, extraData:{poolPubKey,recipient:transaction.creator,recipientNextNonce,amount,units}}

        } else return {isOk:false, reason:'No such account or wrong input to function of contract'}

    },

    /*
     
    Method to delegate your assets to some validator | pool once you have staking ticket

    transaction.payload.params[0] is:

    {
        poolPubKey:<Format is Ed25519_pubkey>
        amount:<amount in KLY or UNO> | NOTE:must be int - not float
        units:<KLY|UNO>
        quorumAgreements:{

            quorumMemberPubKey1: Signature(`stake:${poolPubKey}:${transaction.creator}:${transaction.nonce}:${amount}:${units}`),
            ...
            quorumMemberPubKeyN: Signature(`stake:${poolPubKey}:${transaction.creator}:${transaction.nonce}:${amount}:${units}`)

        }
    }
    
    */
    
    stake:async(threadContext,transaction) => {

        let {poolPubKey,amount,units,quorumAgreements} = transaction.payload.params[0]

        let poolStorage

        if(threadContext === 'AT'){

            poolStorage = await getFromApprovementThreadState(poolPubKey+'(POOL)_STORAGE_POOL')

        } else {
        
            let shardWherePoolStorageLocated = await getFromState(poolPubKey+'(POOL)_POINTER').catch(()=>null)

            poolStorage = await getFromState(shardWherePoolStorageLocated+':'+poolPubKey+'(POOL)_STORAGE_POOL').catch(()=>null)

        }

        // Verify the majority's proof

        let dataThatShouldBeSignedByQuorum = `stake:${poolPubKey}:${transaction.creator}:${transaction.nonce}:${amount}:${units}`

        let majorityProofIsOk = verifyQuorumMajoritySolution(dataThatShouldBeSignedByQuorum,quorumAgreements)

        if(majorityProofIsOk){

            // Here we also need to check if pool is still not fullfilled
            // Also, instantly check if account is whitelisted

            if(poolStorage && (poolStorage.whiteList.length===0 || poolStorage.whiteList.includes(transaction.creator))){

                let threadById = threadContext === 'AT' ? WORKING_THREADS.APPROVEMENT_THREAD : WORKING_THREADS.VERIFICATION_THREAD

                let amountIsBiggerThanMinimalStake = amount >= threadById.WORKFLOW_OPTIONS.MINIMAL_STAKE_PER_ENTITY
 
                let noOverstake = poolStorage.totalPower+poolStorage.overStake <= poolStorage.totalPower+amount


                if(amountIsBiggerThanMinimalStake && noOverstake){

                    if(!poolStorage.stakers[transaction.creator]) poolStorage.stakers[transaction.creator] = {kly:0, uno:0}


                    if(units === 'kly'){

                        poolStorage.stakers[transaction.creator].kly += amount

                        poolStorage.totalPower += amount

                    } else {

                        poolStorage.stakers[transaction.creator].uno += amount

                        poolStorage.totalPower += amount

                    }


                    
                    // Now check if pool has enough power

                    if(poolStorage.totalPower >= threadById.WORKFLOW_OPTIONS.VALIDATOR_STAKE && !threadById.EPOCH.poolsRegistry.includes(poolPubKey)){

                        threadById.EPOCH.poolsRegistry.push(poolPubKey)

                    }

                    if(threadContext === 'VT' && !WORKING_THREADS.VERIFICATION_THREAD.VERIFICATION_STATS_PER_POOL[poolPubKey]){

                        WORKING_THREADS.VERIFICATION_THREAD.VERIFICATION_STATS_PER_POOL[poolPubKey]={   
                                
                            index:-1,
                        
                            hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
                        
                        }

                    }

                } else {

                    // TODO: return funds

                    return {isOk:false,reason:'Overview failed'}
    
                }


            } else {

                // TODO: return funds

                return {isOk:false,reason:'No such pool or your account is not in whitelist'}

            }
            
        } else return {isOk:false}

    },


    /*
     
        Method to delegate your assets to some validator | pool

        transaction.payload.params[0] is:

        {
            poolPubKey:<Format is Ed25519_pubkey(POOL)>
            amount:<amount in KLY or UNO> | NOTE:must be int - not float
            type:<KLY|UNO>
        }

    
    */
    unstake:async (threadContext,transaction) => {

        let {poolPubKey,amount,units} = transaction.payload.params[0],

            poolStorage = await getFromState(originShard+':'+poolPubKey+'_STORAGE_POOL'),

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



    },

    reduceNumberOfUno:async(threadContext,transaction) => {



    }
        
}