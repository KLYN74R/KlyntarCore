import {NODE_METADATA, WORKING_THREADS} from './blockchain_preparation.js'

import {getUtcTimestamp} from '../../KLY_Utils/utils.js'

import {CONFIGURATION} from '../../klyn74r.js'




export let getRandomFromArray = arr => {

    let randomIndex = Math.floor(Math.random() * arr.length)
  
    return arr[randomIndex]

}




export let getAllKnownPeers=()=>[...CONFIGURATION.NODE_LEVEL.BOOTSTRAP_NODES,...NODE_METADATA.PEERS]




// NODE_METADATA.CORE_MAJOR_VERSION shows the major version of your node(core)
// We use this function on VERIFICATION_THREAD and APPROVEMENT_THREAD to make sure your node can continue to work
// If major version for network-level was changed but you still has an old version - it should be stopped and update software
export let isMyCoreVersionOld = threadID => WORKING_THREADS[threadID].CORE_MAJOR_VERSION > NODE_METADATA.CORE_MAJOR_VERSION




export let epochStillFresh = thread => thread.EPOCH.startTimestamp + thread.NETWORK_PARAMETERS.EPOCH_TIME > getUtcTimestamp()