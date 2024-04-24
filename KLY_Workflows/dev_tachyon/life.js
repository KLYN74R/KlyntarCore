import {GET_MAJORITY, GET_QUORUM, GET_FROM_QUORUM_THREAD_STATE, IS_MY_VERSION_OLD, DECRYPT_KEYS, HEAP_SORT} from './utils.js'

import {BLOCKCHAIN_GENESIS, CONFIGURATION, FASTIFY_SERVER} from '../../klyn74r.js'

import {START_VERIFICATION_THREAD} from './verification_process/verification.js'

import {LOG, PATH_RESOLVE, BLAKE3, COLORS} from '../../KLY_Utils/utils.js'

import {KLY_EVM} from '../../KLY_VirtualMachines/kly_evm/vm.js'

import fetch from 'node-fetch'

import level from 'level'

import Web3 from 'web3'

import ora from 'ora'

import fs from 'fs'



// 7 main threads - main core logic

import {BUILD_TEMPORARY_SEQUENCE_OF_VERIFICATION_THREAD} from './life/temp_vt_sequence_builder.js'

import {SHARE_BLOCKS_AND_GET_FINALIZATION_PROOFS} from './life/share_block_and_grab_proofs.js'

import {FIND_AGGREGATED_EPOCH_FINALIZATION_PROOFS} from './life/find_new_epoch.js'

import {CHECK_IF_ITS_TIME_TO_START_NEW_EPOCH} from './life/new_epoch_proposer.js'

import {SHARDS_LEADERS_MONITORING} from './life/shards_leaders_monitoring.js'

import {BLOCKS_GENERATION} from './life/block_generation.js'




// Your decrypted private key
global.PRIVATE_KEY = null



export let GRACEFUL_STOP = async() => {

    console.log('\n')

    LOG('\x1b[31;1mKLYNTAR\x1b[36;1m stop has been initiated.Keep waiting...',COLORS.CYAN)
    
    LOG(fs.readFileSync(PATH_RESOLVE('images/events/termination.txt')).toString(),COLORS.YELLOW)

    console.log('\n')

    LOG('Closing server connections...',COLORS.CYAN)

    await FASTIFY_SERVER.close()

    LOG('Node was gracefully stopped',COLORS.CYAN)
        
    process.exit(0)

}




// Define listeners on typical signals to safely stop the node

process.on('SIGTERM',GRACEFUL_STOP)
process.on('SIGINT',GRACEFUL_STOP)
process.on('SIGHUP',GRACEFUL_STOP)








export let SET_LEADERS_SEQUENCE_FOR_SHARDS = async (epochHandler,epochSeed) => {


    epochHandler.leadersSequence = {}


    let reservePoolsRelatedToShard = new Map() // shardID => [] - array of reserve pools

    let primePoolsPubKeys = new Set(epochHandler.poolsRegistry.primePools)


    for(let reservePoolPubKey of epochHandler.poolsRegistry.reservePools){

        // Otherwise - it's reserve pool
        
        let poolStorage = await GET_FROM_QUORUM_THREAD_STATE(reservePoolPubKey+`(POOL)_STORAGE_POOL`)
    
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

    let hashOfMetadataFromOldEpoch = BLAKE3(JSON.stringify(epochHandler.poolsRegistry)+epochSeed)

    
    //___________________________________________________ Now, build the leaders sequence ___________________________________________________
    
    for(let primePoolID of primePoolsPubKeys){


        let arrayOfReservePoolsRelatedToThisShard = reservePoolsRelatedToShard.get(primePoolID) || []

        let mapping = new Map()

        let arrayOfChallanges = arrayOfReservePoolsRelatedToThisShard.map(validatorPubKey=>{

            let challenge = parseInt(BLAKE3(validatorPubKey+hashOfMetadataFromOldEpoch),16)

            mapping.set(challenge,validatorPubKey)

            return challenge

        })


        let sortedChallenges = HEAP_SORT(arrayOfChallanges)

        let leadersSequence = []

        for(let challenge of sortedChallenges) leadersSequence.push(mapping.get(challenge))

        
        epochHandler.leadersSequence[primePoolID] = leadersSequence
        
    }
    
}




//________________________________________________________________INTERNAL_______________________________________________________________________




let RESTORE_STATE=async()=>{

    let poolsRegistry = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH.poolsRegistry

    let allThePools = poolsRegistry.primePools.concat(poolsRegistry.reservePools)

    let epochFullID = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH.hash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.EPOCH.id

    let tempObject = global.SYMBIOTE_META.TEMP.get(epochFullID)
    


    for(let poolPubKey of allThePools){

        // If this value is related to the current epoch - set to manager, otherwise - take from the VERIFICATION_STATS_PER_POOL as a start point
        // Returned value is {index,hash,(?)afp}

        let {index,hash,afp} = await tempObject.DATABASE.get(poolPubKey).catch(()=>null) || {index:-1,hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',afp:{}}

        
        tempObject.FINALIZATION_STATS.set(poolPubKey,{index,hash,afp})

        //___________________________________ Get the info about current leader _______________________________________

        // *only for prime pools
        
        if(poolsRegistry.primePools.includes(poolPubKey)){

            let leadersHandler = await tempObject.DATABASE.get('LEADERS_HANDLER:'+poolPubKey).catch(()=>false) // {currentLeader:<pointer to current reserve pool in (QT/VT).EPOCH.leadersSequence[<primePool>]>}

            if(leadersHandler){

                tempObject.SHARDS_LEADERS_HANDLERS.set(poolPubKey,leadersHandler)

                // Using pointer - find the appropriate reserve pool

                let currentLeaderPubKey = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH.leadersSequence[poolPubKey][leadersHandler.currentLeader]

                // Key is reserve pool which points to his prime pool

                tempObject.SHARDS_LEADERS_HANDLERS.set(currentLeaderPubKey,poolPubKey)                

            }

        }

    }


    // Finally, once we've started the "next epoch" process - restore it

    let itsTimeForTheNextEpoch = await tempObject.DATABASE.get('TIME_TO_NEW_EPOCH').catch(()=>false)

    if(itsTimeForTheNextEpoch) {

        tempObject.SYNCHRONIZER.set('TIME_TO_NEW_EPOCH',true)

        tempObject.SYNCHRONIZER.set('READY_FOR_NEW_EPOCH',true)

    }

}




//________________________________________________________________EXTERNAL_______________________________________________________________________




export let



LOAD_GENESIS=async()=>{


    let atomicBatch = global.SYMBIOTE_META.STATE.batch(),

        quorumThreadAtomicBatch = global.SYMBIOTE_META.QUORUM_THREAD_METADATA.batch(),
    
        epochTimestamp,

        startPool,

        poolsRegistryForEpochHandler = {primePools:[],reservePools:[]}




    //__________________________________ Load all the configs __________________________________

        
    epochTimestamp = BLOCKCHAIN_GENESIS.EPOCH_TIMESTAMP

    let primePools = new Set(Object.keys(BLOCKCHAIN_GENESIS.POOLS))

    global.SYMBIOTE_META.VERIFICATION_THREAD.VERIFICATION_STATS_PER_POOL = {} // poolPubKey => {index,hash,isReserve}


    for(let [poolPubKey,poolContractStorage] of Object.entries(BLOCKCHAIN_GENESIS.POOLS)){

        let {isReserve} = poolContractStorage

        if(!isReserve) startPool ||= poolPubKey

        // Create the value in VT

        global.SYMBIOTE_META.VERIFICATION_THREAD.VERIFICATION_STATS_PER_POOL[poolPubKey] = {index:-1,hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',isReserve}


        //Create the appropriate storage for pre-set pools. We'll create the simplest variant - but pools will have ability to change it via txs during the chain work
        
        let contractMetadataTemplate = {

            type:"contract",
            lang:'spec/stakingPool',
            balance:0,
            uno:0,
            storages:['POOL'],
            bytecode:''

        }            
        
        let idToAdd = poolPubKey+':'+poolPubKey

        let templateForQt = {

            totalPower:poolContractStorage.totalPower,
            lackOfTotalPower:false,
            stopEpochID:-1,
            isReserve,
            poolURL:poolContractStorage.poolURL,
            wssPoolURL:poolContractStorage.wssPoolURL
        
        }

        // Put the pointer to know the shard which store the pool's data(metadata+storages)
        // Pools' contract metadata & storage are in own shard. Also, reserve pools also here as you see below
        if(isReserve){

            atomicBatch.put(poolPubKey+'(POOL)_POINTER',poolContractStorage.reserveFor)

            idToAdd = poolContractStorage.reserveFor+':'+poolPubKey

            templateForQt.reserveFor = poolContractStorage.reserveFor

            poolsRegistryForEpochHandler.reservePools.push(poolPubKey)

        }else {

            atomicBatch.put(poolPubKey+'(POOL)_POINTER',poolPubKey)

            global.SYMBIOTE_META.VERIFICATION_THREAD.SID_TRACKER[poolPubKey] = 0

            poolsRegistryForEpochHandler.primePools.push(poolPubKey)

        }
        

        quorumThreadAtomicBatch.put(poolPubKey+'(POOL)_STORAGE_POOL',templateForQt)


        //Put metadata
        atomicBatch.put(idToAdd+'(POOL)',contractMetadataTemplate)

        //Put storage
        //NOTE: We just need a simple storage with ID="POOL"
        atomicBatch.put(idToAdd+'(POOL)_STORAGE_POOL',poolContractStorage)

        // Add the account for fees for each leader
        primePools.forEach(anotherValidatorPubKey=>{

            if(anotherValidatorPubKey!==poolPubKey){

                atomicBatch.put(BLAKE3(poolPubKey+':'+anotherValidatorPubKey),{
    
                    type:"account",
                    balance:0,
                    uno:0,
                    nonce:0,
                    rev_t:0
                
                })

            }

        })

        //________________________ Fill the state of KLY-EVM ________________________

        if(!isReserve){

            let evmStateForThisShard = BLOCKCHAIN_GENESIS.EVM[poolPubKey]

            if(evmStateForThisShard){

                let evmKeys = Object.keys(evmStateForThisShard)
    
                for(let evmKey of evmKeys) {
    
                    let {isContract,balance,nonce,code,storage} = evmStateForThisShard[evmKey]
    
                    //Put KLY-EVM to KLY-EVM state db which will be used by Trie
    
                    if(isContract){
    
                        await KLY_EVM.putContract(evmKey,balance,nonce,code,storage)
    
                    }else{
                    
                        await KLY_EVM.putAccount(evmKey,balance,nonce)
                    }


                    let caseIgnoreAccountAddress = Buffer.from(evmKey.slice(2),'hex').toString('hex')

                    // Add assignment to shard
                    atomicBatch.put('SHARD_BIND:'+caseIgnoreAccountAddress,{shard:poolPubKey})
    
                }

            }

            global.SYMBIOTE_META.VERIFICATION_THREAD.KLY_EVM_METADATA[poolPubKey] = {
        
                nextBlockIndex:Web3.utils.toHex(BigInt(0).toString()),
        
                parentHash:'0000000000000000000000000000000000000000000000000000000000000000',
        
                timestamp:Math.floor(epochTimestamp/1000)
        
            }

        }

    }


    //_______________________ Now add the data to state _______________________

    // * Each account / contract must have <shard> property to assign it to appropriate shard

    Object.keys(BLOCKCHAIN_GENESIS.STATE).forEach(
    
        addressOrContractID => {

            if(BLOCKCHAIN_GENESIS.STATE[addressOrContractID].type==='contract'){

                let {lang,balance,uno,storages,bytecode,shard} = BLOCKCHAIN_GENESIS.STATE[addressOrContractID]

                let contractMeta = {

                    type:"contract",
                    lang,
                    balance,
                    uno,
                    storages,
                    bytecode
                
                } 

                //Write metadata first
                atomicBatch.put(shard+':'+addressOrContractID,contractMeta)

                //Finally - write genesis storage of contract sharded by contractID_STORAGE_ID => {}(object)
                for(let storageID of BLOCKCHAIN_GENESIS.STATE[addressOrContractID].storages){

                    BLOCKCHAIN_GENESIS.STATE[addressOrContractID][storageID].shard = shard

                    atomicBatch.put(shard+':'+addressOrContractID+'_STORAGE_'+storageID,BLOCKCHAIN_GENESIS.STATE[addressOrContractID][storageID])

                }

            } else {

                let shardID = BLOCKCHAIN_GENESIS.STATE[addressOrContractID].shard

                atomicBatch.put(shardID+':'+addressOrContractID,BLOCKCHAIN_GENESIS.STATE[addressOrContractID]) //else - it's default account

            }

        }
        
    )


    /*
    
    Set the initial workflow version from genesis

    We keep the official semver notation x.y.z(major.minor.patch)

    You can't continue to work if QUORUM and major part of POOLS decided to vote for major update.
    
    However, if workflow_version has differences in minor or patch values - you can continue to work


    KLYNTAR threads holds only MAJOR version(VERIFICATION_THREAD and QUORUM_THREAD) because only this matter

    */

    //We update this during the verification process(in VERIFICATION_THREAD). Once we find the VERSION_UPDATE - update it !
    global.SYMBIOTE_META.VERIFICATION_THREAD.VERSION = BLOCKCHAIN_GENESIS.VERSION

    //We update this during the work on QUORUM_THREAD. But initially, QUORUM_THREAD has the same version as VT
    global.SYMBIOTE_META.QUORUM_THREAD.VERSION = BLOCKCHAIN_GENESIS.VERSION

    //Also, set the WORKFLOW_OPTIONS that will be changed during the threads' work

    global.SYMBIOTE_META.VERIFICATION_THREAD.WORKFLOW_OPTIONS = {...BLOCKCHAIN_GENESIS.WORKFLOW_OPTIONS}

    global.SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS = {...BLOCKCHAIN_GENESIS.WORKFLOW_OPTIONS}



    
    await atomicBatch.write()

    await quorumThreadAtomicBatch.write()




    // Node starts to verify blocks from the first validator in genesis, so sequency matter
    
    global.SYMBIOTE_META.VERIFICATION_THREAD.SHARD_POINTER = startPool

    global.SYMBIOTE_META.VERIFICATION_THREAD.KLY_EVM_STATE_ROOT = await KLY_EVM.getStateRoot()


    global.SYMBIOTE_META.VERIFICATION_THREAD.EPOCH = {

        id:0,

        hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',

        poolsRegistry:JSON.parse(JSON.stringify(poolsRegistryForEpochHandler)),
        
        startTimestamp:epochTimestamp,

        quorum:[],

        leadersSequence:{}
    
    }
    

    //Make template, but anyway - we'll find checkpoints on hostchains
    global.SYMBIOTE_META.QUORUM_THREAD.EPOCH = {

        id:0,

        hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',

        poolsRegistry:JSON.parse(JSON.stringify(poolsRegistryForEpochHandler)),

        startTimestamp:epochTimestamp,

        quorum:[],

        leadersSequence:{}
    
    }


    // Set the rubicon to stop tracking spent txs from WAITING_ROOMs of pools' contracts. Value means the checkpoint id lower edge
    // If your stake/unstake tx was below this line - it might be burned. However, the line is set by QUORUM, so it should be safe
    global.SYMBIOTE_META.VERIFICATION_THREAD.RUBICON = 0
    
    global.SYMBIOTE_META.QUORUM_THREAD.RUBICON = 0


    let nullHash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

    let vtEpochHandler = global.SYMBIOTE_META.VERIFICATION_THREAD.EPOCH

    let qtEpochHandler = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH


    //We get the quorum for VERIFICATION_THREAD based on own local copy of VERIFICATION_STATS_PER_POOL state
    vtEpochHandler.quorum = GET_QUORUM(vtEpochHandler.poolsRegistry,global.SYMBIOTE_META.VERIFICATION_THREAD.WORKFLOW_OPTIONS,nullHash)

    //...However, quorum for QUORUM_THREAD might be retrieved from VERIFICATION_STATS_PER_POOL of checkpoints. It's because both threads are async
    qtEpochHandler.quorum = GET_QUORUM(qtEpochHandler.poolsRegistry,global.SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS,nullHash)


    //Finally, build the reassignment chains for current epoch in QT and VT

    await SET_LEADERS_SEQUENCE_FOR_SHARDS(qtEpochHandler,nullHash)

    vtEpochHandler.leadersSequence = JSON.parse(JSON.stringify(qtEpochHandler.leadersSequence))

},




PREPARE_BLOCKCHAIN=async()=>{

    //Loading spinner
    let initSpinner

    if(!CONFIGURATION.NODE_LEVEL.PRELUDE.NO_SPINNERS){

        initSpinner = ora({
        
            color:'red',
        
            prefixText:`\u001b[38;5;${process.env.KLY_MODE==='mainnet'?'23':'202'}m [${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]\u001b[38;5;99m(pid:${process.pid})  \x1b[36;1mPreparing symbiote\x1b[0m`
        
        }).start()

    }


    //____________________________________________Prepare structures_________________________________________________


    //Contains default set of properties for major part of potential use-cases on symbiote
    global.SYMBIOTE_META = {

        VERSION:+(fs.readFileSync(PATH_RESOLVE('KLY_Workflows/dev_tachyon/version.txt')).toString()),
        
        MEMPOOL:[], //to hold onchain transactions here(contract calls,txs,delegations and so on)

   
        STATE_CACHE:new Map(), // ID => ACCOUNT_STATE

        QUORUM_THREAD_CACHE:new Map(), // ADDRESS => ACCOUNT_STATE

        STUFF_CACHE:new Map(),

        
        PEERS:[], // Peers to exchange data with

        //________________ CONSENSUS RELATED MAPPINGS(per epoch) _____________

        TEMP:new Map()
    
    }


    !fs.existsSync(process.env.CHAINDATA_PATH) && fs.mkdirSync(process.env.CHAINDATA_PATH)



    //___________________________Load functionality to verify/filter/transform txs_______________________________


    //Importnat and must be the same for symbiote at appropriate chunks of time
    await import(`./verification_process/verifiers.js`).then(mod=>
    
        global.SYMBIOTE_META.VERIFIERS=mod.VERIFIERS
        
    )

    //Might be individual for each node
    global.SYMBIOTE_META.FILTERS=(await import(`./verification_process/txs_filters.js`)).default;


    //______________________________________Prepare databases and storages___________________________________________


    //Create subdirs due to rational solutions
    [
    
        'BLOCKS', // For blocks. BlockID => block
    
        'STATE', // Contains state of accounts, contracts, services, metadata and so on. The main database like NTDS.dit

        'EPOCH_DATA', // Contains epoch data - AEFPs, AFPs, etc.

        'QUORUM_THREAD_METADATA', // QUORUM_THREAD itself and other stuff

        //_______________________________ EVM storage _______________________________

        //'KLY_EVM' Contains state of EVM

        //'KLY_EVM_METADATA' Contains metadata for KLY-EVM pseudochain (e.g. blocks, logs and so on)
        

    ].forEach(
        
        dbName => global.SYMBIOTE_META[dbName]=level(process.env.CHAINDATA_PATH+`/${dbName}`,{valueEncoding:'json'})
        
    )
    

    global.SYMBIOTE_META.GENERATION_THREAD = await global.SYMBIOTE_META.BLOCKS.get('GT').catch(error=>
        
        error.notFound
        ?
        {
            
            epochFullId:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef#-1',

            epochIndex:0,
            
            prevHash:`0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef`, // "null" hash
            
            nextIndex:0 // so the first block will be with index 0
        
        }
        :
        (LOG(`Some problem with loading metadata of generation thread\nError:${error}`,COLORS.RED),process.exit(106))
                        
    )


    //Load from db or return empty object
    global.SYMBIOTE_META.QUORUM_THREAD = await global.SYMBIOTE_META.QUORUM_THREAD_METADATA.get('QT').catch(()=>({}))
        


    //________________Load metadata about symbiote-current hight,collaped height,height for export,etc.___________________


    
    global.SYMBIOTE_META.VERIFICATION_THREAD = await global.SYMBIOTE_META.STATE.get('VT').catch(error=>{

        if(error.notFound){

            //Default initial value
            return {
            
                SHARD_POINTER:'',

                VT_FINALIZATION_STATS:{}, // primePoolPubKey => {currentLeaderOnShard,index,hash}

                VERIFICATION_STATS_PER_POOL:{}, // PUBKEY => {index:'',hash:'',isReserve:boolean}

                KLY_EVM_STATE_ROOT:'', // General KLY-EVM state root
 
                KLY_EVM_METADATA:{}, // primePoolEd25519PubKey => {nextBlockIndex,parentHash,timestamp}

                TEMP_REASSIGNMENTS:{}, // epochID => primePool => {currentLeader:<uint - index of current shard leader based on REASSIGNMENT_CHAINS>,reassignments:{ReservePool=>{index,hash}}}

                SID_TRACKER:{}, // shardID(Ed25519 pubkey of prime pool) => index

                EPOCH:{} // epoch handler

            }

        }else{

            LOG(`Some problem with loading metadata of verification thread\nError:${error}`,COLORS.RED)
            
            process.exit(105)

        }
        
    })

        
    if(global.SYMBIOTE_META.VERIFICATION_THREAD.VERSION===undefined){

        await LOAD_GENESIS()

        //______________________________________Commit the state of VT and QT___________________________________________

        await global.SYMBIOTE_META.STATE.put('VT',global.SYMBIOTE_META.VERIFICATION_THREAD)

        await global.SYMBIOTE_META.QUORUM_THREAD_METADATA.put('QT',global.SYMBIOTE_META.QUORUM_THREAD)

    }


    //________________________________________Set the state of KLY-EVM______________________________________________


    await KLY_EVM.setStateRoot(global.SYMBIOTE_META.VERIFICATION_THREAD.KLY_EVM_STATE_ROOT)


    //_______________________________Check the version of QT and VT and if need - update________________________________
    



    if(IS_MY_VERSION_OLD('QUORUM_THREAD')){

        LOG(`New version detected on QUORUM_THREAD. Please, upgrade your node software`,COLORS.YELLOW)

        console.log('\n')
        console.log(fs.readFileSync(PATH_RESOLVE('images/events/update.txt')).toString())
    

        // Stop the node to update the software
        GRACEFUL_STOP()

    }


    if(IS_MY_VERSION_OLD('VERIFICATION_THREAD')){

        LOG(`New version detected on VERIFICATION_THREAD. Please, upgrade your node software`,COLORS.YELLOW)

        console.log('\n')
        console.log(fs.readFileSync(PATH_RESOLVE('images/events/update.txt')).toString())
    

        // Stop the node to update the software
        GRACEFUL_STOP()

    }


    let epochFullID = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH.hash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.EPOCH.id


    if(global.SYMBIOTE_META.GENERATION_THREAD.epochFullId === epochFullID && !global.SYMBIOTE_META.GENERATION_THREAD.quorum){

        global.SYMBIOTE_META.GENERATION_THREAD.quorum = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH.quorum

        global.SYMBIOTE_META.GENERATION_THREAD.majority = GET_MAJORITY(global.SYMBIOTE_META.QUORUM_THREAD.EPOCH)

    }

    //_________________________________Add the temporary data of current QT__________________________________________
    
    let quorumTemporaryDB = level(process.env.CHAINDATA_PATH+`/${epochFullID}`,{valueEncoding:'json'})
    
    global.SYMBIOTE_META.TEMP.set(epochFullID,{

        FINALIZATION_PROOFS:new Map(), // blockID => Map(quorumMemberPubKey=>SIG(prevBlockHash+blockID+blockHash+QT.EPOCH.HASH+"#"+QT.EPOCH.id)). Proofs that validator voted for block epochID:blockCreatorX:blockIndexY with hash H

        TEMP_CACHE:new Map(),  // simple key=>value mapping to be used as temporary cache for epoch
    
        FINALIZATION_STATS:new Map(), // mapping( validatorID => {index,hash,afp} ). Used to start voting for checkpoints.      Each pair is a special handler where key is a pubkey of appropriate validator and value is the ( index <=> id ) which will be in checkpoint
    
        EPOCH_EDGE_OPERATIONS_MEMPOOL:[],  // default mempool for epoch edge operations
        
        SYNCHRONIZER:new Map(), // used as mutex to prevent async changes of object | multiple operations with several await's | etc.

        SHARDS_LEADERS_HANDLERS:new Map(), // primePoolPubKey => {currentLeader:<number>} | ReservePool => PrimePool


        //____________________Mapping which contains temporary databases for____________________

        DATABASE:quorumTemporaryDB // DB with temporary data that we need during epoch    

    })


    // Fill the FINALIZATION_STATS with the latest, locally stored data

    await RESTORE_STATE()


    //__________________________________Decrypt private key to memory of process__________________________________



    await DECRYPT_KEYS(initSpinner).then(()=>
    
        //Print just first few bytes of keys to view that they were decrypted well.Looks like checksum
        LOG(`Private key was decrypted successfully`,COLORS.GREEN)        
    
    ).catch(error=>{
    
        LOG(`Keys decryption failed.Please,check your password carefully.In the worst case-use your decrypted keys from safezone and repeat procedure of encryption via CLI\n${error}`,COLORS.RED)
 
        process.exit(107)

    })

},




RUN_BLOCKCHAIN=async()=>{


    await PREPARE_BLOCKCHAIN()

    //_________________________ RUN SEVERAL ASYNC THREADS _________________________

    //✅0.Start verification process - process blocks and find new epoch step-by-step
    START_VERIFICATION_THREAD()

    //✅1.Thread to find AEFPs and change the epoch for QT
    FIND_AGGREGATED_EPOCH_FINALIZATION_PROOFS()

    //✅2.Share our blocks within quorum members and get the finalization proofs
    SHARE_BLOCKS_AND_GET_FINALIZATION_PROOFS()

    //✅3.Thread to propose AEFPs to move to next epoch
    CHECK_IF_ITS_TIME_TO_START_NEW_EPOCH()

    //✅4.Thread to track changes of leaders on shards
    SHARDS_LEADERS_MONITORING()

    //✅5.Function to build the temporary sequence of blocks to verify them
    BUILD_TEMPORARY_SEQUENCE_OF_VERIFICATION_THREAD()

    //✅6.Start to generate blocks
    BLOCKS_GENERATION()

    //Check if bootstrap nodes is alive
    CONFIGURATION.NODE_LEVEL.BOOTSTRAP_NODES.forEach(endpoint=>
                
        fetch(endpoint+'/addpeer',{
            
            method:'POST',
            
            body:JSON.stringify([BLOCKCHAIN_GENESIS.SYMBIOTE_ID,CONFIGURATION.NODE_LEVEL.MY_HOSTNAME]),

            headers:{'contentType':'application/json'}
        
        })
            
            .then(res=>res.text())
            
            .then(val=>LOG(val==='OK'?`Received pingback from \x1b[32;1m${endpoint}\x1b[36;1m. Node is \x1b[32;1malive`:`\x1b[36;1mAnswer from bootstrap \x1b[32;1m${endpoint}\x1b[36;1m => \x1b[34;1m${val}`,COLORS.CYAN))
            
            .catch(error=>LOG(`Bootstrap node \x1b[32;1m${endpoint}\x1b[31;1m send no response or some error occured \n${error}`,COLORS.RED))

    )

}