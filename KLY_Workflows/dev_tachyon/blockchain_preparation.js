import {getCurrentEpochQuorum, getQuorumMajority} from './common_functions/quorum_related.js'

import {customLog, pathResolve, blake3Hash, logColors} from '../../KLY_Utils/utils.js'

import {setLeadersSequenceForShards} from './life/shards_leaders_monitoring.js'

import {BLOCKCHAIN_GENESIS, FASTIFY_SERVER} from '../../klyn74r.js'

import {KLY_EVM} from '../../KLY_VirtualMachines/kly_evm/vm.js'

import {isMyCoreVersionOld, decryptKeys} from './utils.js'

import level from 'level'

import Web3 from 'web3'

import fs from 'fs'




// First of all - define the NODE_METADATA globally available object

export let NODE_METADATA = {

    VERSION:+(fs.readFileSync(pathResolve('KLY_Workflows/dev_tachyon/version.txt')).toString()), // major version of core. In case network decides to add modification, fork is created & software should be updated
    
    MEMPOOL:[], // to hold onchain transactions here(contract calls,txs,delegations and so on)

    PEERS:[] // peers to exchange data with. Just strings with addresses    

}


global.MEMPOOL = NODE_METADATA.MEMPOOL



export let EPOCH_METADATA_MAPPING = new Map() // cache to hold metadata for specific epoch by it's ID. Mapping(EpochID=>Mapping)




export let GLOBAL_CACHES = {

    STATE_CACHE:new Map(), // cache to hold accounts of EOAs/contracts. Mapping(ID => ACCOUNT_STATE). Used by VERIFICATION_THREAD

    APPROVEMENT_THREAD_CACHE:new Map(), // ... the same, but used by APPROVEMENT_THREAD

    STUFF_CACHE:new Map(), // cache for different stuff during node work


}




export let WORKING_THREADS = {

    VERIFICATION_THREAD: {
            
        SHARD_POINTER:'',

        VERIFICATION_STATS_PER_POOL:{}, // PUBKEY => {index:'',hash:'',isReserve:boolean}


        KLY_EVM_STATE_ROOT:'', // General KLY-EVM state root

        KLY_EVM_METADATA:{}, // primePoolEd25519PubKey => {nextBlockIndex,parentHash,timestamp}


        TEMP_REASSIGNMENTS:{}, // epochID => primePool => {currentLeader:<uint - index of current shard leader based on REASSIGNMENT_CHAINS>,reassignments:{ReservePool=>{index,hash}}}

        SID_TRACKER:{}, // shardID(Ed25519 pubkey of prime pool) => index


        TOTAL_STATS:{

            totalBlocksNumber:0,
            
            totalTxsNumber:0,

            successfulTxsNumber:0

        },

        STATS_PER_EPOCH:{

            totalBlocksNumber:0,
            
            totalTxsNumber:0,

            successfulTxsNumber:0

        },

        EPOCH:{} // epoch handler

    },


    GENERATION_THREAD: {
            
        epochFullId:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef#-1',

        epochIndex:0,
        
        prevHash:`0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef`, // "null" hash
        
        nextIndex:0 // so the first block will be with index 0
    
    },

    APPROVEMENT_THREAD:{}

}




// Global object which holds LevelDB instances for databases for blocks, state, metadata, KLY_EVM, etc.

let resolveDatabase = name => level(process.env.CHAINDATA_PATH+`/${name}`,{valueEncoding:'json'})


export let BLOCKCHAIN_DATABASES = {

    BLOCKS: resolveDatabase('BLOCKS'), // blockID => block
    
    STATE: resolveDatabase('STATE'), // contains state of accounts, contracts, services, metadata and so on. The main database like NTDS.dit

    EPOCH_DATA: resolveDatabase('EPOCH_DATA'), // contains epoch data that shouldn't be deleted each new epoch (e.g. AEFPs, AFPs, etc.) 

    APPROVEMENT_THREAD_METADATA: resolveDatabase('APPROVEMENT_THREAD_METADATA'), // metadata for APPROVEMENT_THREAD

}


global.STATE = BLOCKCHAIN_DATABASES.STATE





//___________________________________________________________ 0. Set the handlers for system signals(e.g. Ctrl+C to stop blockchain) ___________________________________________________________



// Need it with 'export' keyword because used in other files - for example to gracefully stop the node when it's version is outdated

export let GRACEFUL_STOP = async() => {

    console.log('\n')

    customLog('\x1b[31;1mKLYNTAR\x1b[36;1m stop has been initiated.Keep waiting...',logColors.CYAN)
    
    customLog(fs.readFileSync(pathResolve('images/events/termination.txt')).toString(),logColors.YELLOW)

    console.log('\n')

    customLog('Closing server connections...',logColors.CYAN)

    await FASTIFY_SERVER.close()

    customLog('Node was gracefully stopped',logColors.CYAN)
        
    process.exit(0)

}

process.on('SIGTERM',GRACEFUL_STOP)
process.on('SIGINT',GRACEFUL_STOP)
process.on('SIGHUP',GRACEFUL_STOP)












//___________________________________________________________ 1. Function to restore metadata since the last turn off ___________________________________________________________




let restoreMetadataCache=async()=>{

    let poolsRegistry = WORKING_THREADS.APPROVEMENT_THREAD.EPOCH.poolsRegistry

    let allThePools = poolsRegistry.primePools.concat(poolsRegistry.reservePools)

    let epochFullID = WORKING_THREADS.APPROVEMENT_THREAD.EPOCH.hash+"#"+WORKING_THREADS.APPROVEMENT_THREAD.EPOCH.id

    let currentEpochMetadata = EPOCH_METADATA_MAPPING.get(epochFullID)
    


    for(let poolPubKey of allThePools){

        // If this value is related to the current epoch - set to manager, otherwise - take from the VERIFICATION_STATS_PER_POOL as a start point
        // Returned value is {index,hash,(?)afp}

        let {index,hash,afp} = await currentEpochMetadata.DATABASE.get(poolPubKey).catch(()=>null) || {index:-1,hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',afp:{}}

        
        currentEpochMetadata.FINALIZATION_STATS.set(poolPubKey,{index,hash,afp})

        //___________________________________ Get the info about current leader _______________________________________

        // *only for prime pools
        
        if(poolsRegistry.primePools.includes(poolPubKey)){

            let leadersHandler = await currentEpochMetadata.DATABASE.get('LEADERS_HANDLER:'+poolPubKey).catch(()=>false) // {currentLeader:<pointer to current reserve pool in (QT/VT).EPOCH.leadersSequence[<primePool>]>}

            if(leadersHandler){

                currentEpochMetadata.SHARDS_LEADERS_HANDLERS.set(poolPubKey,leadersHandler)

                // Using pointer - find the appropriate reserve pool

                let currentLeaderPubKey = WORKING_THREADS.APPROVEMENT_THREAD.EPOCH.leadersSequence[poolPubKey][leadersHandler.currentLeader]

                // Key is reserve pool which points to his prime pool

                currentEpochMetadata.SHARDS_LEADERS_HANDLERS.set(currentLeaderPubKey,poolPubKey)                

            }

        }

    }


    // Finally, once we've started the "next epoch" process - restore it

    let itsTimeForTheNextEpoch = await currentEpochMetadata.DATABASE.get('TIME_TO_NEW_EPOCH').catch(()=>false)

    if(itsTimeForTheNextEpoch) {

        currentEpochMetadata.SYNCHRONIZER.set('TIME_TO_NEW_EPOCH',true)

        currentEpochMetadata.SYNCHRONIZER.set('READY_FOR_NEW_EPOCH',true)

    }

}












//___________________________________________________________ 2. Function to load the data from genesis to state ___________________________________________________________




export let setGenesisToState=async()=>{


    let atomicBatch = BLOCKCHAIN_DATABASES.STATE.batch(),

        approvementThreadAtomicBatch = BLOCKCHAIN_DATABASES.APPROVEMENT_THREAD_METADATA.batch(),
    
        epochTimestamp,

        startPool,

        poolsRegistryForEpochHandler = {primePools:[],reservePools:[]}




    //__________________________________ Load all the configs __________________________________

        
    epochTimestamp = BLOCKCHAIN_GENESIS.EPOCH_TIMESTAMP

    let primePools = new Set(Object.keys(BLOCKCHAIN_GENESIS.POOLS))


    for(let [poolPubKey,poolContractStorage] of Object.entries(BLOCKCHAIN_GENESIS.POOLS)){

        let {isReserve} = poolContractStorage

        if(!isReserve) startPool ||= poolPubKey

        // Create the value in VT

        WORKING_THREADS.VERIFICATION_THREAD.VERIFICATION_STATS_PER_POOL[poolPubKey] = {index:-1,hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',isReserve}


        //Create the appropriate storage for pre-set pools. We'll create the simplest variant - but pools will have ability to change it via txs during the chain work
        
        let contractMetadataTemplate = {

            type:"contract",
            lang:'system/stakingPool',
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

            WORKING_THREADS.VERIFICATION_THREAD.SID_TRACKER[poolPubKey] = 0

            poolsRegistryForEpochHandler.primePools.push(poolPubKey)

        }
        

        approvementThreadAtomicBatch.put(poolPubKey+'(POOL)_STORAGE_POOL',templateForQt)


        //Put metadata
        atomicBatch.put(idToAdd+'(POOL)',contractMetadataTemplate)

        //Put storage
        //NOTE: We just need a simple storage with ID="POOL"
        atomicBatch.put(idToAdd+'(POOL)_STORAGE_POOL',poolContractStorage)

        // Add the account for fees for each leader
        primePools.forEach(anotherValidatorPubKey=>{

            if(anotherValidatorPubKey!==poolPubKey){

                atomicBatch.put(blake3Hash(poolPubKey+':'+anotherValidatorPubKey),{
    
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

            WORKING_THREADS.VERIFICATION_THREAD.KLY_EVM_METADATA[poolPubKey] = {
        
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

                // Write metadata first
                atomicBatch.put(shard+':'+addressOrContractID,contractMeta)

                // Finally - write genesis storage of contract sharded by contractID_STORAGE_ID => {}(object)

                for(let storageID of BLOCKCHAIN_GENESIS.STATE[addressOrContractID].storages){

                    BLOCKCHAIN_GENESIS.STATE[addressOrContractID][storageID].shard = shard

                    atomicBatch.put(shard+':'+addressOrContractID+'_STORAGE_'+storageID,BLOCKCHAIN_GENESIS.STATE[addressOrContractID][storageID])

                }

            } else {

                let shardID = BLOCKCHAIN_GENESIS.STATE[addressOrContractID].shard

                atomicBatch.put(shardID+':'+addressOrContractID,BLOCKCHAIN_GENESIS.STATE[addressOrContractID]) // else - it's default account

            }

        }
        
    )


    //________________________ Add the storage for system contract related to account abstraction 2.0 and storage abstraction(see abstractions.js) ________________________


    let abstractionsContractMetadata = {

        type:"contract",
        lang:'system/abstractions',
        balance:0,
        uno:0,
        storages:['SET_OF_AA_CONTRACTS'],
        bytecode:''

    }

    let abstractionsContractStorage = {

        contracts:[]

    }



    /*
    
    Set the initial workflow version from genesis

    We keep the official semver notation x.y.z(major.minor.patch)

    You can't continue to work if QUORUM and major part of POOLS decided to vote for major update.
    
    However, if workflow_version has differences in minor or patch values - you can continue to work


    KLYNTAR threads holds only MAJOR version(VERIFICATION_THREAD and APPROVEMENT_THREAD) because only this matter

    */

    //We update this during the verification process(in VERIFICATION_THREAD). Once we find the VERSION_UPDATE - update it !
    WORKING_THREADS.VERIFICATION_THREAD.VERSION = BLOCKCHAIN_GENESIS.VERSION

    //We update this during the work on APPROVEMENT_THREAD. But initially, APPROVEMENT_THREAD has the same version as VT
    WORKING_THREADS.APPROVEMENT_THREAD.VERSION = BLOCKCHAIN_GENESIS.VERSION

    //Also, set the WORKFLOW_OPTIONS that will be changed during the threads' work

    WORKING_THREADS.VERIFICATION_THREAD.WORKFLOW_OPTIONS = {...BLOCKCHAIN_GENESIS.WORKFLOW_OPTIONS}

    WORKING_THREADS.APPROVEMENT_THREAD.WORKFLOW_OPTIONS = {...BLOCKCHAIN_GENESIS.WORKFLOW_OPTIONS}



    
    await atomicBatch.write()

    await approvementThreadAtomicBatch.write()




    // Node starts to verify blocks from the first validator in genesis, so sequency matter
    
    WORKING_THREADS.VERIFICATION_THREAD.SHARD_POINTER = startPool

    WORKING_THREADS.VERIFICATION_THREAD.KLY_EVM_STATE_ROOT = await KLY_EVM.getStateRoot()


    WORKING_THREADS.VERIFICATION_THREAD.EPOCH = {

        id:0,

        hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',

        poolsRegistry:JSON.parse(JSON.stringify(poolsRegistryForEpochHandler)),
        
        startTimestamp:epochTimestamp,

        quorum:[],

        leadersSequence:{}
    
    }
    

    // Make template, but anyway - we'll find checkpoints on hostchains
    WORKING_THREADS.APPROVEMENT_THREAD.EPOCH = {

        id:0,

        hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',

        poolsRegistry:JSON.parse(JSON.stringify(poolsRegistryForEpochHandler)),

        startTimestamp:epochTimestamp,

        quorum:[],

        leadersSequence:{}
    
    }


    // Set the rubicon to stop tracking spent txs from WAITING_ROOMs of pools' contracts. Value means the checkpoint id lower edge
    // If your stake/unstake tx was below this line - it might be burned. However, the line is set by QUORUM, so it should be safe
    WORKING_THREADS.VERIFICATION_THREAD.RUBICON = 0
    
    WORKING_THREADS.APPROVEMENT_THREAD.RUBICON = 0


    let nullHash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

    let vtEpochHandler = WORKING_THREADS.VERIFICATION_THREAD.EPOCH

    let atEpochHandler = WORKING_THREADS.APPROVEMENT_THREAD.EPOCH


    //We get the quorum for VERIFICATION_THREAD based on own local copy of VERIFICATION_STATS_PER_POOL state
    vtEpochHandler.quorum = getCurrentEpochQuorum(vtEpochHandler.poolsRegistry,WORKING_THREADS.VERIFICATION_THREAD.WORKFLOW_OPTIONS,nullHash)

    //...However, quorum for APPROVEMENT_THREAD might be retrieved from VERIFICATION_STATS_PER_POOL of checkpoints. It's because both threads are async
    atEpochHandler.quorum = getCurrentEpochQuorum(atEpochHandler.poolsRegistry,WORKING_THREADS.APPROVEMENT_THREAD.WORKFLOW_OPTIONS,nullHash)


    //Finally, build the reassignment chains for current epoch in QT and VT

    await setLeadersSequenceForShards(atEpochHandler,nullHash)

    vtEpochHandler.leadersSequence = JSON.parse(JSON.stringify(atEpochHandler.leadersSequence))

}












//___________________________________________________________ 2. Function to load the data from genesis to state ___________________________________________________________




export let prepareBlockchain=async()=>{


    // Create the directory for chaindata in case it's doesn't exist yet

    !fs.existsSync(process.env.CHAINDATA_PATH) && fs.mkdirSync(process.env.CHAINDATA_PATH)



    
    //_____________________ Now, we need to load the metadata of GENERATION, APPROVEMENT and VERIFICATION threads _____________________

    // Load generation thread metadata
    let storedGenerationThreadFromDB = await BLOCKCHAIN_DATABASES.BLOCKS.get('GT').catch(()=>null)

    if(storedGenerationThreadFromDB){

        WORKING_THREADS.GENERATION_THREAD = storedGenerationThreadFromDB

    }

    // Load approvement thread metadata
    let storedApprovementThreadFromDB = await BLOCKCHAIN_DATABASES.APPROVEMENT_THREAD_METADATA.get('AT').catch(()=>null)

    if(storedApprovementThreadFromDB){

        WORKING_THREADS.APPROVEMENT_THREAD = storedApprovementThreadFromDB

    }

    // And finally - verification thread metadata
    let storedVerificaionThreadFromDB = await BLOCKCHAIN_DATABASES.STATE.get('VT').catch(()=>null)

    if(storedVerificaionThreadFromDB){

        WORKING_THREADS.VERIFICATION_THREAD = storedVerificaionThreadFromDB

    }
    
    




    if(WORKING_THREADS.VERIFICATION_THREAD.VERSION===undefined){

        await setGenesisToState()

        //______________________________________Commit the state of VT and QT___________________________________________

        await BLOCKCHAIN_DATABASES.BLOCKS.put('VT',WORKING_THREADS.VERIFICATION_THREAD)

        await BLOCKCHAIN_DATABASES.APPROVEMENT_THREAD_METADATA.put('AT',WORKING_THREADS.APPROVEMENT_THREAD)

    }

    // Need it for KLY-EVM JSON-RPC compatibility

    global.KLY_EVM_METADATA = WORKING_THREADS.VERIFICATION_THREAD.KLY_EVM_METADATA


    //________________________________________Set the state of KLY-EVM______________________________________________


    await KLY_EVM.setStateRoot(WORKING_THREADS.VERIFICATION_THREAD.KLY_EVM_STATE_ROOT)


    //_______________________________Check the version of QT and VT and if need - update________________________________
    



    if(isMyCoreVersionOld('APPROVEMENT_THREAD')){

        customLog(`New version detected on APPROVEMENT_THREAD. Please, upgrade your node software`,logColors.YELLOW)

        console.log('\n')
        console.log(fs.readFileSync(pathResolve('images/events/update.txt')).toString())
    

        // Stop the node to update the software
        GRACEFUL_STOP()

    }


    if(isMyCoreVersionOld('VERIFICATION_THREAD')){

        customLog(`New version detected on VERIFICATION_THREAD. Please, upgrade your node software`,logColors.YELLOW)

        console.log('\n')
        console.log(fs.readFileSync(pathResolve('images/events/update.txt')).toString())
    

        // Stop the node to update the software
        GRACEFUL_STOP()

    }


    let epochFullID = WORKING_THREADS.APPROVEMENT_THREAD.EPOCH.hash+"#"+WORKING_THREADS.APPROVEMENT_THREAD.EPOCH.id


    if(WORKING_THREADS.GENERATION_THREAD.epochFullId === epochFullID && !WORKING_THREADS.GENERATION_THREAD.quorum){

        WORKING_THREADS.GENERATION_THREAD.quorum = WORKING_THREADS.APPROVEMENT_THREAD.EPOCH.quorum

        WORKING_THREADS.GENERATION_THREAD.majority = getQuorumMajority(WORKING_THREADS.APPROVEMENT_THREAD.EPOCH)

    }

    //_________________________________Add the temporary data of current QT__________________________________________
    
    let temporaryDatabaseForApprovementThread = level(process.env.CHAINDATA_PATH+`/${epochFullID}`,{valueEncoding:'json'})
    
    EPOCH_METADATA_MAPPING.set(epochFullID,{

        FINALIZATION_PROOFS:new Map(), // blockID => Map(quorumMemberPubKey=>SIG(prevBlockHash+blockID+blockHash+QT.EPOCH.HASH+"#"+QT.EPOCH.id)). Proofs that validator voted for block epochID:blockCreatorX:blockIndexY with hash H

        TEMP_CACHE:new Map(),  // simple key=>value mapping to be used as temporary cache for epoch
    
        FINALIZATION_STATS:new Map(), // mapping( validatorID => {index,hash,afp} ). Used to start voting for checkpoints.      Each pair is a special handler where key is a pubkey of appropriate validator and value is the ( index <=> id ) which will be in checkpoint
    
        EPOCH_EDGE_OPERATIONS_MEMPOOL:[],  // default mempool for epoch edge operations
        
        SYNCHRONIZER:new Map(), // used as mutex to prevent async changes of object | multiple operations with several await's | etc.

        SHARDS_LEADERS_HANDLERS:new Map(), // primePoolPubKey => {currentLeader:<number>} | ReservePool => PrimePool


        //____________________Mapping which contains temporary databases for____________________

        DATABASE:temporaryDatabaseForApprovementThread // DB with temporary data that we need during epoch    

    })


    // Fill the FINALIZATION_STATS with the latest, locally stored data

    await restoreMetadataCache()


    //__________________________________Decrypt private key to memory of process__________________________________

    await decryptKeys().then(()=>
            
        customLog(`Private key was decrypted successfully`,logColors.GREEN)        
    
    ).catch(error=>{
    
        customLog(`Keys decryption failed.Please,check your password carefully.In the worst case-use your decrypted keys from safezone and repeat procedure of encryption via CLI\n${error}`,logColors.RED)
 
        process.exit(107)

    })

}