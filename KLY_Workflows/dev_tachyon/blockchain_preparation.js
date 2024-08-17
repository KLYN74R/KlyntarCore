import {getCurrentEpochQuorum, getQuorumMajority} from './common_functions/quorum_related.js'

import {setLeadersSequenceForShards} from './life/shards_leaders_monitoring.js'

import {customLog, pathResolve, logColors} from '../../KLY_Utils/utils.js'

import {BLOCKCHAIN_GENESIS, FASTIFY_SERVER} from '../../klyn74r.js'

import {KLY_EVM} from '../../KLY_VirtualMachines/kly_evm/vm.js'

import {isMyCoreVersionOld, decryptKeys} from './utils.js'

import level from 'level'

import Web3 from 'web3'

import fs from 'fs'




let resolveDatabase = name => level(process.env.CHAINDATA_PATH+`/${name}`,{valueEncoding:'json'})




// First of all - define the NODE_METADATA globally available object

export let NODE_METADATA = {

    CORE_MAJOR_VERSION:+(fs.readFileSync(pathResolve('KLY_Workflows/dev_tachyon/version.txt')).toString()), // major version of core. In case network decides to add modification, fork is created & software should be updated
    
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

        VERIFICATION_STATS_PER_POOL:{}, // PUBKEY => {index:'',hash:''}


        KLY_EVM_STATE_ROOT:'', // General KLY-EVM state root

        KLY_EVM_METADATA:{}, // shardID => {nextBlockIndex,parentHash,timestamp}


        TEMP_REASSIGNMENTS:{},

        SID_TRACKER:{}, // shardID => index


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

export let BLOCKCHAIN_DATABASES = {

    BLOCKS: resolveDatabase('BLOCKS'), // blockID => block
    
    STATE: resolveDatabase('STATE'), // contains state of accounts, contracts, services, metadata and so on. The main database like NTDS.dit

    EPOCH_DATA: resolveDatabase('EPOCH_DATA'), // contains epoch data that shouldn't be deleted each new epoch (e.g. AEFPs, AFPs, etc.) 

    APPROVEMENT_THREAD_METADATA: resolveDatabase('APPROVEMENT_THREAD_METADATA'), // metadata for APPROVEMENT_THREAD

    EXPLORER_DATA: resolveDatabase('APPROVEMENT_THREAD_METADATA') // just a database for misc useful data for explorers & API. Just to store useful artifacts separately from state

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












let restoreMetadataCaches=async()=>{

    // Function to restore metadata since the last turn off

    let poolsRegistry = WORKING_THREADS.APPROVEMENT_THREAD.EPOCH.poolsRegistry

    let epochFullID = WORKING_THREADS.APPROVEMENT_THREAD.EPOCH.hash+"#"+WORKING_THREADS.APPROVEMENT_THREAD.EPOCH.id

    let currentEpochMetadata = EPOCH_METADATA_MAPPING.get(epochFullID)
    


    for(let poolPubKey of poolsRegistry){

        // If this value is related to the current epoch - set to manager, otherwise - take from the VERIFICATION_STATS_PER_POOL as a start point
        // Returned value is {index,hash,(?)afp}

        let {index,hash,afp} = await currentEpochMetadata.DATABASE.get(poolPubKey).catch(()=>null) || {index:-1,hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',afp:{}}

        
        currentEpochMetadata.FINALIZATION_STATS.set(poolPubKey,{index,hash,afp})

    }

    for(let shardID of WORKING_THREADS.APPROVEMENT_THREAD.EPOCH.shardsRegistry){

        let leadersHandler = await currentEpochMetadata.DATABASE.get('LEADERS_HANDLER:'+shardID).catch(()=>null)

        if(leadersHandler){

            currentEpochMetadata.SHARDS_LEADERS_HANDLERS.set(shardID,leadersHandler)

            // Using pointer - find the current leader

            let currentLeaderPubKey = WORKING_THREADS.APPROVEMENT_THREAD.EPOCH.leadersSequence[shardID][leadersHandler.currentLeader]

            currentEpochMetadata.SHARDS_LEADERS_HANDLERS.set(currentLeaderPubKey,shardID)                

        }

    }

    // Finally, once we've started the "next epoch" process - restore it

    let itsTimeForTheNextEpoch = await currentEpochMetadata.DATABASE.get('TIME_TO_NEW_EPOCH').catch(()=>false)

    if(itsTimeForTheNextEpoch) {

        currentEpochMetadata.SYNCHRONIZER.set('TIME_TO_NEW_EPOCH',true)

        currentEpochMetadata.SYNCHRONIZER.set('READY_FOR_NEW_EPOCH',true)

    }

}








let setGenesisToState=async()=>{


    let verificationThreadAtomicBatch = BLOCKCHAIN_DATABASES.STATE.batch(),

        approvementThreadAtomicBatch = BLOCKCHAIN_DATABASES.APPROVEMENT_THREAD_METADATA.batch(),
    
        epochTimestamp = BLOCKCHAIN_GENESIS.FIRST_EPOCH_START_TIMESTAMP,

        poolsRegistryForEpochHandler = [],

        shardsRegistry = [],

        numberOfShards = 0




    //__________________________________ Load info about pools __________________________________


    for(let [poolPubKey,poolContractStorage] of Object.entries(BLOCKCHAIN_GENESIS.POOLS)){

        let bindToShard = poolContractStorage.shard

        // Create the value in VT

        WORKING_THREADS.VERIFICATION_THREAD.VERIFICATION_STATS_PER_POOL[poolPubKey] = {index:-1,hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'}


        //Create the appropriate storage for pre-set pools. We'll create the simplest variant - but pools will have ability to change it via txs during the chain work
        
        let contractMetadataTemplate = {

            type:'contract',
            lang:'system/staking',
            balance:0,
            uno:0,
            gas:0,
            storages:['POOL'],
            bytecode:''

        }
        
        // If new shard occured - add appropriate indexer

        let isNewShard = false

        if(WORKING_THREADS.VERIFICATION_THREAD.SID_TRACKER[bindToShard] !== 0) {

            WORKING_THREADS.VERIFICATION_THREAD.SID_TRACKER[bindToShard] = 0

            isNewShard = true

            numberOfShards++

            shardsRegistry.push(`shard_${numberOfShards}`)

        }

        
        // Store all info about pool(pointer+metadata+storage) to state

        verificationThreadAtomicBatch.put(poolContractStorage.shard+':'+'(POOL)_POINTER',bindToShard)

        verificationThreadAtomicBatch.put(poolContractStorage.shard+':'+'(POOL)',contractMetadataTemplate)
    
        verificationThreadAtomicBatch.put(poolContractStorage.shard+':'+'(POOL)_STORAGE_POOL',poolContractStorage)

        // Do the same for approvement thread

        approvementThreadAtomicBatch.put(poolPubKey+'(POOL)_STORAGE_POOL',poolContractStorage)

        // Register new pool

        poolsRegistryForEpochHandler.push(poolPubKey)


        //________________________ Fill the state of KLY-EVM ________________________

        if(isNewShard){

            let evmStateForThisShard = BLOCKCHAIN_GENESIS.EVM[bindToShard]

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
                    verificationThreadAtomicBatch.put('SHARD_BIND:'+caseIgnoreAccountAddress,{shard:bindToShard})
    
                }

            }

            WORKING_THREADS.VERIFICATION_THREAD.KLY_EVM_METADATA[bindToShard] = {
        
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

                let {lang,balance,uno,gas,storages,bytecode,shard} = BLOCKCHAIN_GENESIS.STATE[addressOrContractID]

                let contractMeta = {

                    type:'contract',
                    lang,
                    balance,
                    uno,
                    gas,
                    storages,
                    bytecode
                
                } 

                // Write metadata first
                
                verificationThreadAtomicBatch.put(shard+':'+addressOrContractID,contractMeta)

                // Finally - write genesis storage of contract sharded by contractID_STORAGE_ID => {}(object)

                for(let storageID of BLOCKCHAIN_GENESIS.STATE[addressOrContractID].storages){

                    verificationThreadAtomicBatch.put(shard+':'+addressOrContractID+'_STORAGE_'+storageID,BLOCKCHAIN_GENESIS.STATE[addressOrContractID][storageID])

                }

            } else {

                // Else - it's default EOA account

                let shardID = BLOCKCHAIN_GENESIS.STATE[addressOrContractID].shard

                verificationThreadAtomicBatch.put(shardID+':'+addressOrContractID,BLOCKCHAIN_GENESIS.STATE[addressOrContractID])

            }

        }
        
    )


    /*
    
    Set the initial workflow version from genesis

    We keep the official semver notation x.y.z(major.minor.patch)

    You can't continue to work if QUORUM and major part of POOLS decided to vote for major update.
    
    However, if workflow_version has differences in minor or patch values - you can continue to work


    KLYNTAR threads holds only MAJOR version(VERIFICATION_THREAD and APPROVEMENT_THREAD) because only this matter

    */

    WORKING_THREADS.VERIFICATION_THREAD.CORE_MAJOR_VERSION = BLOCKCHAIN_GENESIS.CORE_MAJOR_VERSION

    WORKING_THREADS.APPROVEMENT_THREAD.CORE_MAJOR_VERSION = BLOCKCHAIN_GENESIS.CORE_MAJOR_VERSION

    // Also, set the NETWORK_PARAMETERS that will be changed during the threads' work

    WORKING_THREADS.VERIFICATION_THREAD.NETWORK_PARAMETERS = {...BLOCKCHAIN_GENESIS.NETWORK_PARAMETERS}

    WORKING_THREADS.APPROVEMENT_THREAD.NETWORK_PARAMETERS = {...BLOCKCHAIN_GENESIS.NETWORK_PARAMETERS}



    
    await verificationThreadAtomicBatch.write()

    await approvementThreadAtomicBatch.write()




    // Node starts to verify blocks from the first validator in genesis, so sequency matter
    
    WORKING_THREADS.VERIFICATION_THREAD.SHARD_POINTER = 'shard_0'

    WORKING_THREADS.VERIFICATION_THREAD.KLY_EVM_STATE_ROOT = await KLY_EVM.getStateRoot()


    WORKING_THREADS.VERIFICATION_THREAD.EPOCH = {

        id:0,

        hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',

        poolsRegistry:JSON.parse(JSON.stringify(poolsRegistryForEpochHandler)),

        shardsRegistry,
        
        startTimestamp:epochTimestamp,

        quorum:[], // [pool0,pool1,...,poolN]

        leadersSequence:{} // shardID => [pool0,pool1,...,poolN]
    
    }
    

    // Make template, but anyway - we'll find checkpoints on hostchains
    WORKING_THREADS.APPROVEMENT_THREAD.EPOCH = {

        id:0,

        hash:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',

        poolsRegistry:JSON.parse(JSON.stringify(poolsRegistryForEpochHandler)),

        shardsRegistry,

        startTimestamp:epochTimestamp,

        quorum:[], // [pool0,pool1,...,poolN]

        leadersSequence:{} // shardID => [pool0,pool1,...,poolN]
    
    }


    let nullHash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

    let vtEpochHandler = WORKING_THREADS.VERIFICATION_THREAD.EPOCH

    let atEpochHandler = WORKING_THREADS.APPROVEMENT_THREAD.EPOCH


    //We get the quorum for VERIFICATION_THREAD based on own local copy of VERIFICATION_STATS_PER_POOL state
    vtEpochHandler.quorum = getCurrentEpochQuorum(vtEpochHandler.poolsRegistry,WORKING_THREADS.VERIFICATION_THREAD.NETWORK_PARAMETERS,nullHash)

    //...However, quorum for APPROVEMENT_THREAD might be retrieved from VERIFICATION_STATS_PER_POOL of checkpoints. It's because both threads are async
    atEpochHandler.quorum = getCurrentEpochQuorum(atEpochHandler.poolsRegistry,WORKING_THREADS.APPROVEMENT_THREAD.NETWORK_PARAMETERS,nullHash)


    // Finally, build the reassignment chains for current epoch in APPROVEMENT_THREAD and VERIFICAION_THREAD

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
    
    




    if(WORKING_THREADS.VERIFICATION_THREAD.CORE_MAJOR_VERSION === undefined){

        await setGenesisToState()

        //______________________________________Commit the state of VT and AT___________________________________________

        await BLOCKCHAIN_DATABASES.BLOCKS.put('VT',WORKING_THREADS.VERIFICATION_THREAD)

        await BLOCKCHAIN_DATABASES.APPROVEMENT_THREAD_METADATA.put('AT',WORKING_THREADS.APPROVEMENT_THREAD)

    }

    // Need it for KLY-EVM JSON-RPC compatibility

    global.KLY_EVM_METADATA = WORKING_THREADS.VERIFICATION_THREAD.KLY_EVM_METADATA


    //________________________________________Set the state of KLY-EVM______________________________________________


    await KLY_EVM.setStateRoot(WORKING_THREADS.VERIFICATION_THREAD.KLY_EVM_STATE_ROOT)


    //_______________________________Check the version of AT and VT and if need - update________________________________
    



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

    //_________________________________Add the temporary data of current AT__________________________________________
    
    let temporaryDatabaseForApprovementThread = level(process.env.CHAINDATA_PATH+`/${epochFullID}`,{valueEncoding:'json'})
    
    EPOCH_METADATA_MAPPING.set(epochFullID,{

        FINALIZATION_PROOFS:new Map(), // blockID => Map(quorumMemberPubKey=>SIG(prevBlockHash+blockID+blockHash+AT.EPOCH.HASH+"#"+AT.EPOCH.id)). Proofs that validator voted for block epochID:blockCreatorX:blockIndexY with hash H

        TEMP_CACHE:new Map(),  // simple key=>value mapping to be used as temporary cache for epoch
    
        FINALIZATION_STATS:new Map(), // mapping( validatorID => {index,hash,afp} ). Used to start voting for checkpoints.      Each pair is a special handler where key is a pubkey of appropriate validator and value is the ( index <=> id ) which will be in checkpoint
    
        EPOCH_EDGE_TRANSACTIONS_MEMPOOL:[],  // default mempool for epoch edge transactions
        
        SYNCHRONIZER:new Map(), // used as mutex to prevent async changes of object | multiple operations with several await's | etc.

        SHARDS_LEADERS_HANDLERS:new Map(), // shardID => {currentLeader:<number>} | Pool => shardID


        //____________________Mapping which contains temporary databases for____________________

        DATABASE:temporaryDatabaseForApprovementThread // DB with temporary data that we need during epoch    

    })


    // Fill the FINALIZATION_STATS with the latest, locally stored data

    await restoreMetadataCaches()


    //__________________________________Decrypt private key to memory of process__________________________________

    await decryptKeys().then(()=>
            
        customLog(`Private key was decrypted successfully`,logColors.GREEN)        
    
    ).catch(error=>{
    
        customLog(`Keys decryption failed.Please,check your password carefully.In the worst case-use your decrypted keys from safezone and repeat procedure of encryption via CLI\n${error}`,logColors.RED)
 
        process.exit(107)

    })

}