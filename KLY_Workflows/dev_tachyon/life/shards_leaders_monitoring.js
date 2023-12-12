import {EPOCH_STILL_FRESH,USE_TEMPORARY_DB} from '../utils.js'

import {GET_GMT_TIMESTAMP} from '../../../KLY_Utils/utils.js'




let TIME_IS_OUT_FOR_CURRENT_SHARD_LEADER=(epochHandler,indexOfCurrentLeaderInSequence,leaderShipTimeframe)=>{

    // Function to check if time frame for current shard leader is done and we have to move to next reserve pools in reassignment chain

    return GET_GMT_TIMESTAMP() >= epochHandler.timestamp+(indexOfCurrentLeaderInSequence+2)*leaderShipTimeframe

}




// Iterate over shards and change the leader if it's appropriate timeframe
export let SHARDS_LEADERS_MONITORING=async()=>{

    let epochHandler = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH

    let epochFullID = epochHandler.hash+"#"+epochHandler.id

    let tempObject = global.SYMBIOTE_META.TEMP.get(epochFullID)

    if(!tempObject){

        setTimeout(SHARDS_LEADERS_MONITORING,3000)

        return

    }


    if(!EPOCH_STILL_FRESH(global.SYMBIOTE_META.QUORUM_THREAD)){

        setTimeout(SHARDS_LEADERS_MONITORING,3000)

        return

    }

    //____________________ Now iterate over shards to check if time is out for current shards leaders and we have to move to next ones ____________________

    for(let primePoolPubKey of epochHandler.poolsRegistry.primePools){

        // Get the current handler and check the timeframe

        let leaderSequenceHandler = tempObject.SHARDS_LEADERS_HANDLERS.get(primePoolPubKey) || {currentLeader:-1}

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

        if(itsNotFinishOfSequence && TIME_IS_OUT_FOR_CURRENT_SHARD_LEADER(epochHandler,indexOfCurrentLeaderInSequence,global.SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS.LEADERSHIP_TIMEFRAME)){

            // Inform websocket server that we shouldn't generate proofs for this leader anymore
            tempObject.SYNCHRONIZER.set('STOP_PROOFS_GENERATION:'+pubKeyOfCurrentShardLeader,true)

            // But anyway - in async env wait until server callback us here that proofs creation is stopped
            if(!tempObject.SYNCHRONIZER.has('GENERATE_FINALIZATION_PROOFS:'+pubKeyOfCurrentShardLeader)){

                // Now, update the LEADERS_HANDLER

                let newLeadersHandler = {
                    
                    currentLeader: leaderSequenceHandler.currentLeader+1
                
                }

                await USE_TEMPORARY_DB('put',tempObject.DATABASE,'LEADERS_HANDLER:'+primePoolPubKey,newLeadersHandler).then(()=>{

                    // Set new reserve pool and delete the old one

                    // Delete the pointer to prime pool for old leader
                    tempObject.SHARDS_LEADERS_HANDLERS.delete(pubKeyOfCurrentShardLeader)

                    // Set new value of handler
                    tempObject.SHARDS_LEADERS_HANDLERS.set(primePoolPubKey,newLeadersHandler)

                    // Add the pointer: NewShardLeaderPubKey => ShardID 
                    tempObject.SHARDS_LEADERS_HANDLERS.set(epochHandler.leadersSequence[primePoolPubKey][newLeadersHandler.currentLeader],primePoolPubKey)

                    tempObject.SYNCHRONIZER.delete('STOP_PROOFS_GENERATION:'+pubKeyOfCurrentShardLeader)

                }).catch(()=>false)

            }

        }

    }

    // Start again
    setImmediate(SHARDS_LEADERS_MONITORING)
    
}