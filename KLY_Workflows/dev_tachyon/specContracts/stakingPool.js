import bls from '../../../KLY_Utils/signatures/multisig/bls.js'

import {GET_ACCOUNT_ON_SYMBIOTE} from '../utils.js'

import {BLAKE3} from '../../../KLY_Utils/utils.js'




export default {

    /*
    
    Used by pool creators to create contract instance and a storage "POOL"

    Payload is
    
    {
        bytecode:'',(empty)
        lang:'SPEC/stakingPool'
        constructorParams:[]
    }

    Required params:[BLSPoolRootKey,Percentage,OverStake,InitPool]

        [*] BLSPoolRootKey - BLS pubkey for validator. The same as PoolID
        [*] Percentage - % of fees that will be earned by BLS pubkey related to PoolID. The rest(100%-Percentage) will be shared among stakers
        [*] OverStake - number of power allowed to overfill the minimum stake. You need this to prevent deletion from validators pool if your stake are lower than minimum
        [*] InitPool

    initPool is object like(thanks to this, you can be the only one staker in your own pool)
    NOTE: initPool is related to creator's pubkey (it's event.creator)

    {
        KLY:<amount>,
        UNO:<amount>
    }
    
    */
    constructor:async (event,atomicBatch)=>{

        let{constructorParams}=event.payload,

            [blsPubKey,percentage,overStake,initPool]=constructorParams,

            poolAlreadyExists = await SYMBIOTE_META.STATE.get(blsPubKey+'(POOL)').catch(_=>false)


        if(!poolAlreadyExists && overStake>0){

            let contractMetadataTemplate = {

                type:"contract",
                lang:'spec/stakingPool',
                balance:0,
                uno:0,
                storages:['POOL'],
                bytecode:''

            }


            let waitingRoomTemplate={}, deployerAccount = await GET_ACCOUNT_ON_SYMBIOTE(event.creator)


            if(deployerAccount){
                
                //TODO: Check if <stakerPubKey> has enough KLY | UNO

                let klyStakingIsOk=true, unoStakingIsOk=true, totalPower=0
                

                if(initPool.KLY){

                    klyStakingIsOk=false

                    let klyStakingPower = initPool.KLY * CONFIG.SYMBIOTE_META.MANIFEST.WORKFLOW_OPTIONS.KLY_UNO_RATIO //convert KLY to UNO

                    klyStakingIsOk = initPool.KLY <= account.balance && klyStakingPower>=CONFIG.SYMBIOTE.MANIFEST.WORKFLOW_OPTIONS.MINIMAL_STAKE
                }

                if(initPool.UNO){

                    unoStakingIsOk=false

                    unoStakingIsOk = initPool.UNO <= account.uno && initPool.UNO>=CONFIG.SYMBIOTE.MANIFEST.WORKFLOW_OPTIONS.MINIMAL_STAKE

                }

                if(klyStakingIsOk && unoStakingIsOk){

                    totalPower+=initPool.KLY * CONFIG.SYMBIOTE_META.MANIFEST.WORKFLOW_OPTIONS.KLY_UNO_RATIO

                    totalPower+=initPool.UNO

                    //Add to waiting room with staked KLY(converted to UNO)
                    waitingRoomTemplate[BLAKE3(event.sig)]={

                        staker:event.creator,
                            
                        stake:{

                            KLY:initPool.KLY,
                                    
                            UNO:initPool.UNO
                                
                        }

                    }

                }

            }

            //On this step we have valid stakers in <waitingRoomTemplate>


            let onlyOnePossibleStorageForStakingContract={
                
                percentage,

                overStake,

                totalPower,// KLY(converted to UNO by CONFIG.SYMBIOTE_META.MANIFEST.WORKFLOW_OPTIONS.VALIDATOR_STAKE_RATIO) + UNO. Must be greater than CONFIG.SYMBIOTE_META.MANIFEST.WORKFLOW_OPTIONS.VALIDATOR_STAKE
                
                STAKERS:{}, // pubkey => {KLY,UNO,REWARD}

                WAITING_ROOM:waitingRoomTemplate //we'll move stakes from "WAITING_ROOM" to "STAKERS" via SPEC_OPS in checkpoints

            }

            
            //Put metadata
            atomicBatch.put(blsPubKey+'(POOL)',contractMetadataTemplate)

            //Put storage
            //NOTE: We just need a simple storage with ID="POOL"
            atomicBatch.put(blsPubKey+'(POOL)'+'_STORAGE_POOL',onlyOnePossibleStorageForStakingContract)


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
    
    stake:async (event,atomicBatch)=>{

        let {pool,amount,type}=event.payload,

            poolExists = await SYMBIOTE_META.STATE.get(pool+'(POOL)').catch(_=>false)


    //Here we also need to check if pool is still not fullfilled
    if(poolExists){

        let stakerAccount = await GET_ACCOUNT_ON_SYMBIOTE(event.creator)

        if(stakerAccount){
            
            let stakeIsOk=false, unoStakingIsOk=true, totalStakedPower=0
            

            if(type==='KLY'){

                let klyStakingPower = amount * CONFIG.SYMBIOTE_META.MANIFEST.WORKFLOW_OPTIONS.KLY_UNO_RATIO //convert KLY to UNO

                stakeIsOk = amount <= account.balance && klyStakingPower>=CONFIG.SYMBIOTE.MANIFEST.WORKFLOW_OPTIONS.MINIMAL_STAKE
            
            }

            if(initPool.UNO){

                unoStakingIsOk = initPool.UNO <= account.uno && initPool.UNO>=CONFIG.SYMBIOTE.MANIFEST.WORKFLOW_OPTIONS.MINIMAL_STAKE

            }

            if(stakeIsOk && unoStakingIsOk){

                //Add to waiting room with staked KLY(converted to UNO)
                waitingRoomTemplate[BLAKE3(event.sig)]={

                    staker:event.creator,
                        
                    stake:{

                        KLY:initPool.KLY,
                                
                        UNO:initPool.UNO
                            
                    }

                }

            }
        
        }
    
    }

    },

    //Used to get the stake back
    unstake:async (payload,atomicBatch)=>{

        

    },

    //Used to withdraw earned
    unstake:async (payload,atomicBatch)=>{

        

    },

    //Allow pool authority to change percent for him and stakers
    changePercent:async (payload,atomicBatch)=>{

        

    },

}