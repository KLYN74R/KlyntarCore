import bls from '../../../KLY_Utils/signatures/multisig/bls.js'

import {GET_ACCOUNT_ON_SYMBIOTE} from '../utils.js'




export default {

    /*
    
    Used by pool creators to create contract instance and a single storage with id="POOL"

    Payload is
    
    {
        bytecode:'',(empty)
        lang:'SPEC/stakingPool'
        constructorParams:[]
    }

    Required params:['BLS pool rootKey',percentage,initPool]

    initPool is object like

    {
        "PUBKEY":{
            KLY:<amount>,
            UNO:<amount>
        }
    }
    
    */
    constructor:async (payload,atomicBatch)=>{

        let{constructorParams}=payload,

            [blsPubKey,percentage,pool]=constructorParams,

            poolAlreadyExists = await SYMBIOTE_META.STATE.get(blsPubKey+'(POOL)').catch(_=>false)


        if(!poolAlreadyExists){

            let contractMetadataTemplate = {

                type:"contract",
                lang:'spec/stakingPool',
                balance:0,
                uno:0,
                storages:['POOL'],
                bytecode:''

            }

            let validCandidatesToAddToPool=[]

            Object.keys(pool).forEach(stakerPubKey=>{

                //TODO: Check if <stakerPubKey> has enough KLY | UNO

                validCandidatesToAddToPool.push(

                    GET_ACCOUNT_ON_SYMBIOTE(stakerPubKey).then(account=>{

                        if(pool[stakerPubKey].KLY <= account.balance){

                            return {
                                
                                pub:stakerPubKey,
                            
                                stake:pool[stakerPubKey].KLY*CONFIG.SYMBIOTE_META.MANIFEST.WORKFLOW_OPTIONS.VALIDATOR_STAKE_RATIO
                            
                            }

                        }
    
                    })

                )

            })

            
            let filteredPool={}


            await Promise.all(validCandidatesToAddToPool).then(candidates=>{

                //Here we have array with elements {pub,stake}. We'll form a valid storage for them

            })


            let onlyOnePossibleStorageForStakingContract={
                
                percentage,
                
                pool:filteredPool

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
    
    stake:async (payload,atomicBatch)=>{

        

    },

    //Used to withdraw
    unstake:async (payload,atomicBatch)=>{

        

    },

    //Allow pool authority to change percent for him and stakers
    changePercent:async (payload,atomicBatch)=>{

        

    },

}