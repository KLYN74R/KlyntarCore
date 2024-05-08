import {getFromApprovementThreadState, useTemporaryDb} from '../common_functions/approvement_thread_related.js'

import {EPOCH_METADATA_MAPPING, WORKING_THREADS} from '../blockchain_preparation.js'

import {blake3Hash, getUtcTimestamp} from '../../../KLY_Utils/utils.js'

import {epochStillFresh, heapSort,} from '../utils.js'







let timeIsOutForCurrentShardLeader=(epochHandler,indexOfCurrentLeaderInSequence,leaderShipTimeframe)=>{

    // Function to check if time frame for current shard leader is done and we have to move to next reserve pools in reassignment chain

    return getUtcTimestamp() >= epochHandler.startTimestamp+(indexOfCurrentLeaderInSequence+2)*leaderShipTimeframe

}



export let setLeadersSequenceForShards = async (epochHandler,epochSeed) => {


    epochHandler.leadersSequence = {}


    let reservePoolsRelatedToShard = new Map() // shardID => [] - array of reserve pools

    let primePoolsPubKeys = new Set(epochHandler.poolsRegistry.primePools)


    for(let reservePoolPubKey of epochHandler.poolsRegistry.reservePools){

        // Otherwise - it's reserve pool
        
        let poolStorage = await getFromApprovementThreadState(reservePoolPubKey+`(POOL)_STORAGE_POOL`)
    
        if(poolStorage){

            let {reserveFor} = poolStorage

            if(!reservePoolsRelatedToShard.has(reserveFor)) reservePoolsRelatedToShard.set(reserveFor,[])

            reservePoolsRelatedToShard.get(reserveFor).push(reservePoolPubKey)
                    
        }

    }


    /*
    
        After this cycle we have:

        [0] primePoolsIDs - Set(primePool0,primePool1,...)
        [1] reservePoolsRelatedToShardAndStillNotUsed - Map(primePoolPubKey=>[reservePool1,reservePool2,...reservePoolN])

    
    */

    let hashOfMetadataFromOldEpoch = blake3Hash(JSON.stringify(epochHandler.poolsRegistry)+epochSeed)

    
    //___________________________________________________ Now, build the leaders sequence ___________________________________________________
    
    for(let primePoolID of primePoolsPubKeys){


        let arrayOfReservePoolsRelatedToThisShard = reservePoolsRelatedToShard.get(primePoolID) || []

        let mapping = new Map()

        let arrayOfChallanges = arrayOfReservePoolsRelatedToThisShard.map(validatorPubKey=>{

            let challenge = parseInt(blake3Hash(validatorPubKey+hashOfMetadataFromOldEpoch),16)

            mapping.set(challenge,validatorPubKey)

            return challenge

        })


        let sortedChallenges = heapSort(arrayOfChallanges)

        let leadersSequence = []

        for(let challenge of sortedChallenges) leadersSequence.push(mapping.get(challenge))

        
        epochHandler.leadersSequence[primePoolID] = leadersSequence
        
    }
    
}



// Iterate over shards and change the leader if it's appropriate timeframe
export let shardsLeadersMonitoring=async()=>{

    let epochHandler = WORKING_THREADS.APPROVEMENT_THREAD.EPOCH

    let epochFullID = epochHandler.hash+"#"+epochHandler.id

    let currentEpochMetadata = EPOCH_METADATA_MAPPING.get(epochFullID)

    if(!currentEpochMetadata){

        setTimeout(shardsLeadersMonitoring,3000)

        return

    }


    if(!epochStillFresh(WORKING_THREADS.APPROVEMENT_THREAD)){

        setTimeout(shardsLeadersMonitoring,3000)

        return

    }

    //____________________ Now iterate over shards to check if time is out for current shards leaders and we have to move to next ones ____________________

    for(let primePoolPubKey of epochHandler.poolsRegistry.primePools){

        // Get the current handler and check the timeframe

        let leaderSequenceHandler = currentEpochMetadata.SHARDS_LEADERS_HANDLERS.get(primePoolPubKey) || {currentLeader:-1}

        let pubKeyOfCurrentShardLeader, indexOfCurrentLeaderInSequence

        if(leaderSequenceHandler.currentLeader !== -1){

            indexOfCurrentLeaderInSequence = leaderSequenceHandler.currentLeader

            pubKeyOfCurrentShardLeader = epochHandler.leadersSequence[primePoolPubKey][indexOfCurrentLeaderInSequence]

        }else{

            indexOfCurrentLeaderInSequence = -1

            pubKeyOfCurrentShardLeader = primePoolPubKey

        }


        // In case more pools in sequence exists - we can move to it. Otherwise - no sense to change pool as leader because no more candidates
        let itsNotFinishOfSequence = epochHandler.leadersSequence[primePoolPubKey][indexOfCurrentLeaderInSequence+1]

        if(itsNotFinishOfSequence && timeIsOutForCurrentShardLeader(epochHandler,indexOfCurrentLeaderInSequence,WORKING_THREADS.APPROVEMENT_THREAD.WORKFLOW_OPTIONS.LEADERSHIP_TIMEFRAME)){

            // Inform websocket server that we shouldn't generate proofs for this leader anymore
            currentEpochMetadata.SYNCHRONIZER.set('STOP_PROOFS_GENERATION:'+pubKeyOfCurrentShardLeader,true)

            // But anyway - in async env wait until server callback us here that proofs creation is stopped
            if(!currentEpochMetadata.SYNCHRONIZER.has('GENERATE_FINALIZATION_PROOFS:'+pubKeyOfCurrentShardLeader)){

                // Now, update the LEADERS_HANDLER

                let newLeadersHandler = {
                    
                    currentLeader: leaderSequenceHandler.currentLeader+1
                
                }

                await useTemporaryDb('put',currentEpochMetadata.DATABASE,'LEADERS_HANDLER:'+primePoolPubKey,newLeadersHandler).then(()=>{

                    // Set new reserve pool and delete the old one

                    // Delete the pointer to prime pool for old leader
                    currentEpochMetadata.SHARDS_LEADERS_HANDLERS.delete(pubKeyOfCurrentShardLeader)

                    // Set new value of handler
                    currentEpochMetadata.SHARDS_LEADERS_HANDLERS.set(primePoolPubKey,newLeadersHandler)

                    // Add the pointer: NewShardLeaderPubKey => ShardID 
                    currentEpochMetadata.SHARDS_LEADERS_HANDLERS.set(epochHandler.leadersSequence[primePoolPubKey][newLeadersHandler.currentLeader],primePoolPubKey)

                    currentEpochMetadata.SYNCHRONIZER.delete('STOP_PROOFS_GENERATION:'+pubKeyOfCurrentShardLeader)

                }).catch(()=>false)

            }

        }

    }

    // Start again
    setImmediate(shardsLeadersMonitoring)
    
}