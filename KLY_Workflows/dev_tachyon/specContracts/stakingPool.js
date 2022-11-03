import {GET_ACCOUNT_ON_SYMBIOTE} from '../utils.js'

import {BLAKE3} from '../../../KLY_Utils/utils.js'




export let CONTRACT = {

    /*
    
    Used by pool creators to create contract instance and a storage "POOL"

    Payload is
    
    {
        bytecode:'',(empty)
        lang:'SPEC/stakingPool'
        constructorParams:[]
    }

    Required params:[BLSPoolRootKey,Percentage,OverStake,WhiteList]

        [*] BLSPoolRootKey - BLS pubkey for validator. The same as PoolID
        [*] Percentage - % of fees that will be earned by BLS pubkey related to PoolID. The rest(100%-Percentage) will be shared among stakers
        [*] OverStake - number of power(in UNO) allowed to overfill the minimum stake. You need this to prevent deletion from validators pool if your stake are lower than minimum
        [*] WhiteList - array of addresses who can invest in this pool. Thanks to this, you can set own logic to distribute fees,make changes and so on by adding only one address - ID of smart contract

    */
    constructor:async (event,atomicBatch) => {

        let{constructorParams}=event.payload,

            [blsPubKey,percentage,overStake,whiteList]=constructorParams,

            poolAlreadyExists = await SYMBIOTE_META.STATE.get(blsPubKey+'(POOL)').catch(_=>false)


        if(!poolAlreadyExists && overStake>0 && Array.isArray(whiteList)){

            let contractMetadataTemplate = {

                type:"contract",
                lang:'spec/stakingPool',
                balance:0,
                uno:0,
                storages:['POOL'],
                bytecode:''

            }

            let onlyOnePossibleStorageForStakingContract={
                
                percentage,

                overStake,

                whiteList,

                totalPower:0, // KLY(converted to UNO by CONFIG.SYMBIOTE_META.MANIFEST.WORKFLOW_OPTIONS.VALIDATOR_STAKE_RATIO) + UNO. Must be greater than CONFIG.SYMBIOTE_META.MANIFEST.WORKFLOW_OPTIONS.VALIDATOR_STAKE
                
                STAKERS:{}, // Pubkey => {KLY,UNO,REWARD}

                WAITING_ROOM:{} // We'll move stakes from "WAITING_ROOM" to "STAKERS" via SPEC_OPS in checkpoints

            }

            
            //Put metadata
            atomicBatch.put(blsPubKey+'(POOL)',contractMetadataTemplate)

            //Put storage
            //NOTE: We just need a simple storage with ID="POOL"
            atomicBatch.put(blsPubKey+'(POOL)_STORAGE_POOL',onlyOnePossibleStorageForStakingContract)


        }

    },

    /*
     
    Method to delegate your assets to some validator | pool

    Payload

    {
        pool:<id of special contract - BLS validator's pubkey'>
        amount:<amount in KLY or UNO> | NOTE:must be int - not float
        type:<KLY|UNO>
    }
    
    */
    
    stake:async (event,atomicBatch) => {

        let {pool,amount,type}=event.payload,

            poolStorage = await SYMBIOTE_META.STATE.get(pool+'(POOL)_STORAGE_POOL').catch(_=>false)


        //Here we also need to check if pool is still not fullfilled
        //Also, instantly check if account is whitelisted
        if(poolStorage && (poolStorage.whiteList[0]==='*' || poolStorage.whiteList.includes(event.creator))){
    
            let stakerAccount = await GET_ACCOUNT_ON_SYMBIOTE(event.creator)

            if(stakerAccount){
            
                let stakeIsOk=false
            
                if(type==='KLY'){

                    let klyStakingPower = amount * CONFIG.SYMBIOTE_META.MANIFEST.WORKFLOW_OPTIONS.KLY_UNO_RATIO //convert KLY to UNO

                    stakeIsOk = amount <= stakerAccount.balance && klyStakingPower>=CONFIG.SYMBIOTE.MANIFEST.WORKFLOW_OPTIONS.MINIMAL_STAKE
            
                }else if(type==='UNO'){

                    stakeIsOk = amount <= stakerAccount.uno && amount>=CONFIG.SYMBIOTE.MANIFEST.WORKFLOW_OPTIONS.MINIMAL_STAKE

                }

                if(stakeIsOk){

                    let totalStakedPower = type==='UNO' ? amount : amount * CONFIG.SYMBIOTE_META.MANIFEST.WORKFLOW_OPTIONS.KLY_UNO_RATIO

                    if(poolStorage.totalPower+totalStakedPower <= poolStorage.overStake+CONFIG.SYMBIOTE_META.MANIFEST.WORKFLOW_OPTIONS.VALIDATOR_STAKE){

                        //Add to waiting room with staked KLY(converted to UNO)
                        poolStorage.WAITING_ROOM[BLAKE3(event.sig)]={

                            staker:event.creator,
                        
                            stake:{type,amount}

                        }

                        //Reduce number of KLY/UNO from account
                        if(type==='KLY') stakerAccount.balance-=amount
                        
                        else stakerAccount.uno-=amount

                        //Finally, put changes to atomic batch
                        atomicBatch.put(pool+'(POOL)_STORAGE_POOL',poolStorage)

                    }

                }
        
            }
    
        }

    },

    /*
     
        Method to delegate your assets to some validator | pool

        Payload

        {
            pool:<id of special contract - BLS validator's pubkey'>
            amount:<amount in KLY or UNO> | NOTE:must be int - not float
            type:<KLY|UNO>
        }
    
    */
    unstake:async (event,atomicBatch) => {

        let {pool,amount,type}=event.payload,

            poolStorage = await SYMBIOTE_META.STATE.get(pool+'(POOL)_STORAGE_POOL').catch(_=>false)


        //Here we also need to check if pool is still not fullfilled
        if(poolStorage){

            if(stakerAccount){
            
                let stakeIsOk=false
            
                if(type==='KLY'){

                    let klyStakingPower = amount * CONFIG.SYMBIOTE_META.MANIFEST.WORKFLOW_OPTIONS.KLY_UNO_RATIO //convert KLY to UNO

                    stakeIsOk = amount <= account.balance && klyStakingPower>=CONFIG.SYMBIOTE.MANIFEST.WORKFLOW_OPTIONS.MINIMAL_STAKE
            
                }else if(type==='UNO'){

                    stakeIsOk = amount <= account.uno && amount>=CONFIG.SYMBIOTE.MANIFEST.WORKFLOW_OPTIONS.MINIMAL_STAKE

                }

                if(stakeIsOk){

                    let totalStakedPower = type==='UNO' ? amount : amount * CONFIG.SYMBIOTE_META.MANIFEST.WORKFLOW_OPTIONS.KLY_UNO_RATIO

                    if(poolStorage.totalPower+totalStakedPower <= poolStorage.overStake+CONFIG.SYMBIOTE_META.MANIFEST.WORKFLOW_OPTIONS.VALIDATOR_STAKE){

                        //Add to waiting room with staked KLY(converted to UNO)
                        poolStorage.WAITING_ROOM[BLAKE3(event.sig)]={

                            staker:event.creator,
                        
                            stake:{type,amount}

                        }

                        //Increase general staking power for pool
                        poolStorage.totalPower+=totalStakedPower

                        //Finally, put changes to atomic batch
                        atomicBatch.put(pool+'(POOL)_STORAGE_POOL',poolStorage)

                    }

                }
        
            }
    
        }

    }

}