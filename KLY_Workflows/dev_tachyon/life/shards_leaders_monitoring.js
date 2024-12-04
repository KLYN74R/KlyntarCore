import {getFromApprovementThreadState} from '../common_functions/approvement_thread_related.js'

import {blake3Hash} from '../../../KLY_Utils/utils.js'





export let setLeadersSequenceForShards = async (epochHandler,epochSeed) => {


    epochHandler.leadersSequence = {} // shardID => [pool0,pool1,...poolN] 


    let hashOfMetadataFromOldEpoch = blake3Hash(JSON.stringify(epochHandler.poolsRegistry)+epochSeed)


    // Change order of validators pseudo-randomly

    let validatorsExtendedData = new Map()
    
    let totalStakeSum = 0

    for (let validatorPubKey of epochHandler.poolsRegistry) {

        let validatorData = await getFromApprovementThreadState(validatorPubKey+'(POOL)_STORAGE_POOL')

        let requiredData = {

            validatorPubKey, 
        
            totalStake: validatorData.totalStakedKly + validatorData.totalStakedUno 
        
        }

        totalStakeSum += requiredData.totalStake

        validatorsExtendedData.set(validatorPubKey, requiredData)
    
    }


    let assignToShardWithIndex = 0

    for (let i = 0; i < epochHandler.poolsRegistry.length; i++) {

        let cumulativeSum = 0
        
        let hashInput = `${hashOfMetadataFromOldEpoch}_${i}`
        
        let deterministicRandomValue = parseInt(blake3Hash(hashInput), 16) % totalStakeSum

        for (let [validatorPubKey, validator] of validatorsExtendedData) {

            cumulativeSum += validator.totalStake

            if (deterministicRandomValue <= cumulativeSum) {

                let shardID = epochHandler.shardsRegistry[assignToShardWithIndex]

                if(!epochHandler.leadersSequence[shardID]) epochHandler.leadersSequence[shardID] = []
        
                epochHandler.leadersSequence[shardID].push(validatorPubKey)
        
                if(!epochHandler.shardsRegistry[assignToShardWithIndex+1]) assignToShardWithIndex = 0 // next validator will be assigned again to the first shard
        
                else assignToShardWithIndex++ // to assign next validator to the next shard

                totalStakeSum -= validator.totalStake

                validatorsExtendedData.delete(validatorPubKey)
                
                break
            
            }
        
        }
    
    }
            
}