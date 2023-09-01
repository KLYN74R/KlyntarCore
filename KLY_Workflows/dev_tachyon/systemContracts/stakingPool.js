import {GET_ACCOUNT_ON_SYMBIOTE,GET_FROM_STATE} from '../utils.js'

import {BLAKE3} from '../../../KLY_Utils/utils.js'




export let CONTRACT = {

    /*
    
    Used by pool creators to create contract instance and a storage "POOL"

    Payload is
    
    {
        bytecode:'',(empty)
        lang:'spec/stakingPool'
        constructorParams:[]
    }

    Required params:[BLSPoolRootKey,Percentage,OverStake,WhiteList,PoolAddress]

        [*] blsPubKey - BLS pubkey for validator. The same as PoolID
        [*] percentage - % of fees that will be earned by BLS pubkey related to PoolID. The rest(100%-Percentage) will be shared among stakers
        [*] overStake - number of power(in UNO) allowed to overfill the minimum stake. You need this to prevent deletion from validators pool if your stake are lower than minimum
        [*] whiteList - array of addresses who can invest in this pool. Thanks to this, you can set own logic to distribute fees,make changes and so on by adding only one address - ID of smart contract
        [*] poolURL - URL in form http(s)://<domain_or_direct_ip_of_server_cloud_or_smth_like_this>:<port>/<optional_path>
        [*] wssPoolURL - WSS(WebSocket over HTTPS) URL provided by pool for fast data exchange, proofs grabbing, etc.

        ------------ For reserve pools ------------

        [*] isReserve - define type of pool
        
                isReserve=false means that this pool is a prime pool and will have a separate subchain
                isReserve=true means that you pool will be in reserve and will be used only when prime pool will be stopped
        
        [*] reserveFor - SubchainID(pubkey of prime pool)

    */
    constructor:async (transaction,atomicBatch,originSubchain) => {

        let{constructorParams}=transaction.payload,
        
            [blsPubKey,percentage,overStake,whiteList,poolURL,wssPoolURL,isReserve,reserveFor]=constructorParams,

            poolAlreadyExists = await global.SYMBIOTE_META.STATE.get(originSubchain+':'+blsPubKey+'(POOL)').catch(_=>false)


        if(!poolAlreadyExists && overStake>=0 && Array.isArray(whiteList) && typeof poolURL === 'string' && typeof wssPoolURL === 'string'){

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

                poolURL,

                wssPoolURL,

                whiteList,

                isReserve,

                lackOfTotalPower:false,
                    
                stopCheckpointID:-1,

                totalPower:0, // KLY(converted to UNO by WORKFLOW_OPTIONS.VALIDATOR_STAKE_RATIO) + UNO. Must be greater than WORKFLOW_OPTIONS.VALIDATOR_STAKE
                
                stakers:{}, // Pubkey => {kly,uno}

                waitingRoom:{} // We'll move stakes from "WAITING_ROOM" to "STAKERS" via SPEC_OPS in checkpoints

            }


            if(isReserve) onlyOnePossibleStorageForStakingContract.reserveFor=reserveFor

            
            //Put metadata
            atomicBatch.put(originSubchain+':'+blsPubKey+'(POOL)',contractMetadataTemplate)

            //Put storage
            //NOTE: We just need a simple storage with ID="POOL"
            atomicBatch.put(originSubchain+':'+blsPubKey+'(POOL)_STORAGE_POOL',onlyOnePossibleStorageForStakingContract)

        }

    },

    /*
     
    Method to delegate your assets to some validator | pool

    Payload

    {
        pool:<id of special contract - BLS validator's pubkey'>
        amount:<amount in KLY or UNO> | NOTE:must be int - not float
        units:<KLY|UNO>
    }
    
    */
    
    stake:async(transaction,originSubchain) => {

        let fullPoolIdWithPostfix = transaction.payload.contractID, // Format => BLS_pubkey(POOL)

            {amount,units} = transaction.payload.params[0],

            poolStorage = await GET_FROM_STATE(originSubchain+':'+fullPoolIdWithPostfix+'_STORAGE_POOL')


        //Here we also need to check if pool is still not fullfilled
        //Also, instantly check if account is whitelisted

        if(poolStorage && (poolStorage.whiteList.length===0 || poolStorage.whiteList.includes(transaction.creator))){

            let stakerAccount = await GET_ACCOUNT_ON_SYMBIOTE(originSubchain+':'+transaction.creator)

            if(stakerAccount){
            
                let stakeIsOk = (units==='kly'?amount <= stakerAccount.balance:amount <= stakerAccount.uno) && amount >= global.SYMBIOTE_META.VERIFICATION_THREAD.WORKFLOW_OPTIONS.MINIMAL_STAKE_PER_ENTITY

                if(stakeIsOk && poolStorage.totalPower + amount <= poolStorage.overStake+global.SYMBIOTE_META.VERIFICATION_THREAD.WORKFLOW_OPTIONS.VALIDATOR_STAKE){

                    poolStorage.waitingRoom[BLAKE3(transaction.sig)]={

                        checkpointID:global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.id,

                        staker:transaction.creator,

                        amount,

                        units,

                        type:'+' //means "STAKE"
                    
                    }

                    //Reduce number of KLY/UNO from account
                    if(units==='kly') stakerAccount.balance-=amount
                    
                    else stakerAccount.uno-=amount

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
    unstake:async (transaction,originSubchain) => {

        let fullPoolIdWithPostfix=transaction.payload.contractID,

            {amount,units}=transaction.payload.params[0],

            poolStorage = await GET_FROM_STATE(originSubchain+':'+fullPoolIdWithPostfix+'_STORAGE_POOL'),

            stakerInfo = poolStorage.stakers[transaction.creator], // Pubkey => {kly,uno}

            wishedUnstakingAmountIsOk = stakerInfo[units==='kly'?'kly':'uno'] >= amount


        if(poolStorage && wishedUnstakingAmountIsOk){

            poolStorage.waitingRoom[BLAKE3(transaction.sig)]={

                checkpointID:global.SYMBIOTE_META.VERIFICATION_THREAD.CHECKPOINT.id,

                staker:transaction.creator,

                amount,

                units,

                type:'-' //means "UNSTAKE"

            }
    
        }

    }
        
}