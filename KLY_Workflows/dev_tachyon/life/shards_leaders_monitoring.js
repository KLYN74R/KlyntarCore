import {CONFIGURATION} from '../../../klyn74r.js'





export let setLeadersSequenceForShards = async epochHandler => {


    epochHandler.leadersSequence = {} // shardID => [pool0,pool1,...poolN] 


    for(let shardID of epochHandler.shardsRegistry){

        epochHandler.leadersSequence[shardID] = CONFIGURATION.NODE_LEVEL.BLOCK_GENERATOR_PUBKEY

    }
            
}