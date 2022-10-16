import {LOG,SYMBIOTE_ALIAS,PATH_RESOLVE,BLAKE3} from '../../KLY_Utils/utils.js'

import {BROADCAST,DECRYPT_KEYS,BLOCKLOG,SIG,GET_STUFF,VERIFY} from './utils.js'

import bls from '../../KLY_Utils/signatures/multisig/bls.js'

import {START_VERIFICATION_THREAD} from './verification.js'

import Block from './essences/block.js'

import UWS from 'uWebSockets.js'

import readline from 'readline'

import fetch from 'node-fetch'

import Base58 from 'base-58'

import ora from 'ora'

import l from 'level'

import fs from 'fs'




//______________________________________________________________VARIABLES POOL___________________________________________________________________


//++++++++++++++++++++++++ Define general global object  ++++++++++++++++++++++++

//Open writestream in append mode
global.SYMBIOTE_LOGS_STREAM=fs.createWriteStream(process.env.LOGS_PATH+`/symbiote.log`),{flags:'a+'}

global.THREADS_STILL_WORKS={VERIFICATION:false,GENERATION:false}

global.SYSTEM_SIGNAL_ACCEPTED=false

//Your decrypted private key
global.PRIVATE_KEY=null

global.SIG_PROCESS={}





//*********************** SET HANDLERS ON USEFUL SIGNALS ************************



let graceful=()=>{
    
    SYSTEM_SIGNAL_ACCEPTED=true

    console.log('\n')

    LOG('KLYNTAR stop has been initiated.Keep waiting...','I')
    
    LOG(fs.readFileSync(PATH_RESOLVE('images/events/termination.txt')).toString(),'W')
    
    //Probably stop logs on this step
    setInterval(async()=>{

        //Each subprocess in each symbiote must be stopped
        if(!THREADS_STILL_WORKS.GENERATION && !THREADS_STILL_WORKS.VERIFICATION || Object.values(SIG_PROCESS).every(x=>x)){

            console.log('\n')

            //Close logs streams
            await new Promise( resolve => SYMBIOTE_LOGS_STREAM.close( error => {

                LOG(`Logging was stopped for ${SYMBIOTE_ALIAS()} ${error?'\n'+error:''}`,'I')

                resolve()
            
            }))

            LOG('Server stopped','I')

            global.UWS_DESC&&UWS.us_listen_socket_close(UWS_DESC)

            if(CONFIG.SYMBIOTE.STORE_QUORUM_COMMITMENTS_CACHE){
                
                fs.writeFile(process.env[`CHAINDATA_PATH`]+'/commitmentsCache.json',JSON.stringify(Object.fromEntries(SYMBIOTE_META.COMMITMENTS)),()=>{

                    LOG('Validators proofs stored to cache','I')

                    LOG('Node was gracefully stopped','I')
                    
                    process.exit(0)

                })    

            }else{

                LOG('Node was gracefully stopped','I')
                
                process.exit(0)    

            }

        }

    },200)

}




//Define listeners on typical signals to safely stop the node
process.on('SIGTERM',graceful)
process.on('SIGINT',graceful)
process.on('SIGHUP',graceful)


//************************ END SUB ************************









//________________________________________________________________INTERNAL_______________________________________________________________________


//TODO:Add more advanced logic(e.g. number of txs,ratings,etc.)
let GET_EVENTS = () => SYMBIOTE_META.MEMPOOL.splice(0,CONFIG.SYMBIOTE.MANIFEST.WORKFLOW_OPTIONS.EVENTS_LIMIT_PER_BLOCK),


GEN_BLOCKS_START_POLLING=async()=>{


    if(!SYSTEM_SIGNAL_ACCEPTED){

        //With this we say to system:"Wait,we still processing the block"
        THREADS_STILL_WORKS.GENERATION=true

        await GENERATE_PHANTOM_BLOCKS_PORTION()    

        STOP_GEN_BLOCKS_CLEAR_HANDLER=setTimeout(GEN_BLOCKS_START_POLLING,CONFIG.SYMBIOTE.BLOCK_TIME)
        
        CONFIG.SYMBIOTE.STOP_GENERATE_BLOCKS
        &&
        clearTimeout(STOP_GEN_BLOCKS_CLEAR_HANDLER)

    }else{

        LOG(`Block generation for \x1b[36;1m${SYMBIOTE_ALIAS()}\x1b[36;1m was stopped`,'I',CONFIG.SYMBIOTE.SYMBIOTE_ID)

        SIG_PROCESS.GENERATE=true

    }

    //leave function
    THREADS_STILL_WORKS.GENERATION=false
    
}








//________________________________________________________________EXTERNAL_______________________________________________________________________




export let GENERATE_PHANTOM_BLOCKS_PORTION = async () => {


    //Safe "if" branch to prevent unnecessary blocks generation
    if(!SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.includes(CONFIG.SYMBIOTE.PUB)) return


    let myVerificationThreadStats = SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[CONFIG.SYMBIOTE.PUB]



    //!Here check the difference between VT and GT(VT_GT_NORMAL_DIFFERENCE)
    //Set VT_GT_NORMAL_DIFFERENCE to 0 if you don't need any limits

    if(CONFIG.SYMBIOTE.VT_GT_NORMAL_DIFFERENCE && myVerificationThreadStats.INDEX+CONFIG.SYMBIOTE.VT_GT_NORMAL_DIFFERENCE < SYMBIOTE_META.GENERATION_THREAD.NEXT_INDEX){

        LOG(`Block generation skipped because GT is faster than VT. Increase \u001b[38;5;157m<VT_GT_NORMAL_DIFFERENCE>\x1b[36;1m if you need`,'I',CONFIG.SYMBIOTE.SYMBIOTE_ID)

        return

    }
    
    
    /*

    _________________________________________GENERATE PORTION OF BLOCKS___________________________________________
    
    Here we check how many transactions(events) we have locally and generate as many blocks as it's possible
    
    */

                
    let phantomBlocksNumber=Math.ceil(SYMBIOTE_META.MEMPOOL.length/CONFIG.SYMBIOTE.MANIFEST.WORKFLOW_OPTIONS.EVENTS_LIMIT_PER_BLOCK),
    
        promises=[],//to push blocks to storage

        commitmentsArray=[]//to share commitments among other quorun members


    phantomBlocksNumber++//DELETE after tests

    //If nothing to generate-then no sense to generate block,so return
    if(phantomBlocksNumber===0) return 


    LOG(`Number of phantoms to generate \x1b[32;1m${phantomBlocksNumber}`,'I')


    for(let i=0;i<phantomBlocksNumber;i++){


        let eventsArray=await GET_EVENTS(),
            
            blockCandidate=new Block(eventsArray),
                        
            hash=Block.genHash(blockCandidate.creator,blockCandidate.time,blockCandidate.events,blockCandidate.index,blockCandidate.prevHash)
    

        blockCandidate.sig=await SIG(hash)
            
        BLOCKLOG(`New \x1b[36m\x1b[41;1mblock\x1b[0m\x1b[32m generated ——│\x1b[36;1m`,'S',hash,48,'\x1b[32m',blockCandidate)


        SYMBIOTE_META.GENERATION_THREAD.PREV_HASH=hash
 
        SYMBIOTE_META.GENERATION_THREAD.NEXT_INDEX++
    
        let blockID=CONFIG.SYMBIOTE.PUB+':'+blockCandidate.index

        

        if(SYMBIOTE_META.VERIFICATION_THREAD.QUORUM.includes(CONFIG.SYMBIOTE.PUB)){

            //________________________________Create commitments________________________________
            
            let commitmentTemplate={
        
                B:blockID,

                H:hash,

                O:blockCandidate.sig,
            
                S:await SIG(blockID+hash)//self-sign our commitment as one of the validator
        
            }
        
            commitmentsArray.push(commitmentTemplate)

            //Create local pool and push our commitment if we're in quorum

            SYMBIOTE_META.COMMITMENTS.set(blockID+'/'+hash,new Map())

            SYMBIOTE_META.COMMITMENTS.get(blockID+'/'+hash).set(CONFIG.SYMBIOTE.PUB,commitmentTemplate.S)

        }

        promises.push(SYMBIOTE_META.BLOCKS.put(blockID,blockCandidate).then(()=>blockCandidate).catch(error=>{
                
            LOG(`Failed to store block ${blockCandidate.index} on ${SYMBIOTE_ALIAS()} \n${error}`,'F')

            process.emit('SIGINT',122)
            
        }))
           
    }

    
    commitmentsArray={
        
        validator:CONFIG.SYMBIOTE.PUB,
        
        payload:commitmentsArray
    
    }

    
    //Here we need to send metadata templates to other validators and get the signed proofs that they've successfully received blocks
    //?NOTE - we use setTimeout here to delay sending our commitments. We need to give some time for network to share blocks
    setTimeout(async()=>{

        let promises = []

        //0. Initially,try to get pubkey => node_ip binding 
        SYMBIOTE_META.VERIFICATION_THREAD.QUORUM.forEach(
            
            pubkey => promises.push(GET_STUFF(pubkey))
            
        )


        let pureUrls = await Promise.all(promises.splice(0)).then(array=>array.filter(Boolean).map(x=>x.payload.url)),
        
            payload = JSON.stringify(commitmentsArray)//this will be send to validators and to other nodes & endpoints


        for(let validatorNode of pureUrls) {

            fetch(validatorNode+'/commitments',{
                
                method:'POST',
                
                body:payload
            
            }).catch(_=>{})//doesn't matter if error

        }

        //You can also share proofs over the network, not only to validators
        CONFIG.SYMBIOTE.ALSO_SHARE_COMMITMENTS_TO_DEFAULT_NODES
        &&
        BROADCAST('/commitments',payload)


    },CONFIG.SYMBIOTE.TIMEOUT_TO_PRE_SHARE_COMMITMENTS)




    //_______________________________________________COMMIT CHANGES___________________________________________________




    await Promise.all(promises.splice(0)).then(arr=>
        
        SYMBIOTE_META.STATE.put('GT',SYMBIOTE_META.GENERATION_THREAD).then(()=>

            new Promise(resolve=>{

                //And here we should broadcast blocks
                arr.forEach(block=>
                    
                    Promise.all(BROADCAST('/block',block))
                    
                )

                resolve()

            })
            
        )

    )

},




LOAD_GENESIS=async()=>{

    let atomicBatch = SYMBIOTE_META.STATE.batch()

    //Load all the configs
    fs.readdirSync(process.env.GENESIS_PATH).forEach(file=>{

        //Load genesis state or data from backups(not to load state from the beginning)
        let genesis=JSON.parse(fs.readFileSync(process.env.GENESIS_PATH+`/${file}`))
    
        Object.keys(genesis).forEach(
        
            address => atomicBatch.put(address,genesis[address])
            
        )

        //Push the initial validators to verification thread
        SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.push(...genesis.VALIDATORS)

    })

    await atomicBatch.write()

    SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.forEach(
        
        pubkey => SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[pubkey]={INDEX:-1,HASH:'Poyekhali!@Y.A.Gagarin',BLOCKS_GENERATOR:true} // set the initial values
        
    )

    //Node starts to verify blocks from the first validator in genesis, so sequency matter
    
    SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER={
        
        VALIDATOR:SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS[0],
        
        INDEX:-1,
        
        HASH:'Poyekhali!@Y.A.Gagarin'
    
    }

},




PREPARE_SYMBIOTE=async()=>{

    //Loading spinner
    let initSpinner

    if(!CONFIG.PRELUDE.NO_SPINNERS){

        initSpinner = ora({
        
            color:'red',
        
            prefixText:`\u001b[38;5;${process.env.KLY_MODE==='main'?'23':'202'}m [${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]\u001b[38;5;99m(pid:${process.pid})  \x1b[36;1mPreparing symbiote \x1b[32;1m${SYMBIOTE_ALIAS()}\x1b[0m`
        
        }).start()

    }
    



    let cachedCommitments
    
    try{

        cachedCommitments = fs.existsSync(process.env[`CHAINDATA_PATH`]+'/commitmentsCache.json') && JSON.parse(fs.readFileSync(process.env[`CHAINDATA_PATH`]+'/commitmentsCache.json'))

    }catch{

        cachedCommitments = {}

    }




    //____________________________________________Prepare structures_________________________________________________




    //Contains default set of properties for major part of potential use-cases on symbiote
    global.SYMBIOTE_META={
        
        MEMPOOL:[], //to hold onchain events here(contract calls,txs,delegations and so on)
        
        //Сreate mapping for account and it's state to optimize processes while we check blocks-not to read/write to db many times
        ACCOUNTS:new Map(), //ADDRESS => { ACCOUNT_STATE , NONCE_SET , NONCE_DUPLICATES , OUT , TYPE }

        BLACKLIST:new Set(), //To sift addresses which spend more than has when we check another block

        PEERS:[], //Peers to exchange data with

        STUFF_CACHE:new Map(), //BLS pubkey => destination(domain:port,node ip addr,etc.) | 

        COMMITMENTS:new Map(Object.entries(cachedCommitments)), //the first level of "proofs". Commitments is just signatures by some validator from current quorum that validator accept some block X by ValidatorY with hash H

        FINALIZATION_PROOFS:new Map(), //aggregated proofs which proof that some validator has 2/3N+1 commitments for block PubX:Y with hash H. Key is blockID and value is FINALIZATION_PROOF object

        SUPER_FINALIZATION_PROOFS:new Map(), //the last stage of "proofs". Only when we receive this proof for some block <PubX:Y:Hash> we can proceed this block. Key is blockID and value is object described in routes file(routes/main.js)

        CHECKPOINTS:new Map() //used to get the final consensus and get 2/3N+1 similar checkpoints to include to hostchain(s,if we talk about HiveMind)

    }



    
    //OnlyLinuxFans.Due to incapsulation level we need to create sub-level directory for each symbiote
    let pathes=[process.env.CHAINDATA_PATH,process.env.SNAPSHOTS_PATH]
    
    pathes.forEach(
        
        name => !fs.existsSync(`${name}`) && fs.mkdirSync(`${name}`)
        
    )


    

    //___________________________Load functionality to verify/filter/transform events_______________________________


    //Importnat and must be the same for symbiote at appropriate chunks of time
    await import(`./verifiers.js`).then(mod=>{
    
        SYMBIOTE_META.VERIFIERS=mod.VERIFIERS
        
        SYMBIOTE_META.SPENDERS=mod.SPENDERS    
        
    })

    //Might be individual for each node
    SYMBIOTE_META.FILTERS=(await import(`./filters.js`)).default;


    //______________________________________Prepare databases and storages___________________________________________

    


    //Create subdirs due to rational solutions
    [
    
        'BLOCKS',//For blocks(key is index)
        
        'HOSTCHAINS_DATA',//To store metadata from hostchains(proofs,refs,contract results and so on)
    
        'STUFF',//Some data like combinations of validators for aggregated BLS pubkey, endpoint <-> pubkey bindings and so on. Available stuff URL_PUBKEY_BIND | VALIDATORS_PUBKEY_COMBINATIONS | BLOCK_HASHES | .etc

        'CONTRACTS' //Storage of contracts for VMs

    ].forEach(
        
        dbName => SYMBIOTE_META[dbName]=l(process.env.CHAINDATA_PATH+`/${dbName}`,{valueEncoding:'json'})
        
    )
    
    
    
    
    //____________________________________________Load stuff to db___________________________________________________


    Object.keys(CONFIG.SYMBIOTE.LOAD_STUFF).forEach(
        
        id => SYMBIOTE_META.STUFF.put(id,CONFIG.SYMBIOTE.LOAD_STUFF[id])
        
    )

    /*
    
    _____________________________________________State of symbiote___________________________________________________

    Contains state of accounts, contracts, services, metadata and so on
    
    */

    SYMBIOTE_META.STATE=l(process.env.CHAINDATA_PATH+`/STATE`,{valueEncoding:'json'})
    
   

    //...and separate dirs for state and metadata snapshots

    SYMBIOTE_META.SNAPSHOT=l(process.env.SNAPSHOTS_PATH,{valueEncoding:'json'})




    SYMBIOTE_META.GENERATION_THREAD = await SYMBIOTE_META.STATE.get('GT').catch(e=>
        
        e.notFound
        ?
        {
            PREV_HASH:`Poyekhali!@Y.A.Gagarin`,//Genesis hash
            NEXT_INDEX:0//So the first block will be with index 0
        }
        :
        (LOG(`Some problem with loading metadata of generation thread\nSymbiote:${SYMBIOTE_ALIAS()}\nError:${e}`,'F'),process.exit(106))
                        
    )


    let nextIsPresent = await SYMBIOTE_META.BLOCKS.get(CONFIG.SYMBIOTE.PUB+":"+SYMBIOTE_META.GENERATION_THREAD.NEXT_INDEX).catch(e=>false),//OK is in case of absence of next block

        previousBlock=await SYMBIOTE_META.BLOCKS.get(CONFIG.SYMBIOTE.PUB+":"+(SYMBIOTE_META.GENERATION_THREAD.NEXT_INDEX-1)).catch(e=>false)//but current block should present at least locally


    if(nextIsPresent || !(SYMBIOTE_META.GENERATION_THREAD.NEXT_INDEX===0 || SYMBIOTE_META.GENERATION_THREAD.PREV_HASH === BLAKE3( CONFIG.SYMBIOTE.PUB + JSON.stringify(previousBlock.time) + JSON.stringify(previousBlock.events) + CONFIG.SYMBIOTE.SYMBIOTE_ID + previousBlock.index + previousBlock.prevHash))){
        
        initSpinner?.stop()

        LOG(`Something wrong with a sequence of generation thread on \x1b[36;1m${SYMBIOTE_ALIAS()}`,'F')
            
        process.exit(107)

    }

    


    //________________Load metadata about symbiote-current hight,collaped height,height for export,etc.___________________




    SYMBIOTE_META.VERIFICATION_THREAD = await SYMBIOTE_META.STATE.get('VT').catch(e=>{

        if(e.notFound){

            //Default initial value
            return {
                            
                FINALIZED_POINTER:{VALIDATOR:'',INDEX:-1,HASH:''},//pointer to know where we should start to process further blocks
    
                VALIDATORS:[],//BLS pubkey0,pubkey1,pubkey2,...pubkeyN
    
                QUORUM:[],

                VALIDATORS_METADATA:{},//PUBKEY => {INDEX:'',HASH:'',BLOCKS_GENERATOR}
                
                CURRENT_CHECKPOINT:{

                    /*
                        
                        Here will be checkpoint last found on hostchain. Otherwise - genesis checkpoint will be loaded
                        
                    */

                    //Header should be included to hostchain in cleartext to determine valid checkpoints from previous quorum
                    HEADER:{

                        PAYLOAD_HASH:'',//<32 bytes BLAKE3 HASH OF CHECKPOINT PAYLOAD. Quorum sign this hash>
    
                        QUORUM_AGGREGATED_SIGNERS_PUBKEY:'',//<48 bytes BLS AGGREGATED PUBKEY OF VALIDATORS FROM CURRENT QUORUM WHO SIGNED CHECKPOINT>
                    
                        QUORUM_AGGREGATED_SIGNATURE:'',//<96 bytes BLS AGGREGATED SIGNATURE which verified by aggregated pubkey>
                    
                        AFK_SIGNERS:[]//<ARRAY OF AFK VALIDATORS FROM QUORUM WHO SKIPPED CHECKPOINT GENERATION PROCEDURE.48 BYTES PER PUBKEY>

                    },

                    PAYLOAD:{

                        VALIDATORS_METADATA:{}, //The same as VALIDATORS_METADATA
                        
                        OTHER_CHECKPOINTS:{} //(SYMBIOTE_ID => CHECKPOINTS_HEADERS_OF_OTHER_SYMBIOTES)

                    },

                    TIMESTAMP:1665663019 //we set the timestamp from hostchains to track days changes
                

                },
                
                HOSTCHAIN_MONITORING:{},

                SNAPSHOT_COUNTER:CONFIG.SYMBIOTE.SNAPSHOTS.RANGE
            
            }

        }else{

            LOG(`Some problem with loading metadata of verification thread\nSymbiote:${SYMBIOTE_ALIAS()}\nError:${e}`,'F')
            
            process.exit(105)

        }
        
    })


    if(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.length===0) await LOAD_GENESIS()


    //_____________________________________Set some values to stuff cache___________________________________________


    //Because if we don't have quorum, we'll get it later after discovering checkpoints
    if(SYMBIOTE_META.VERIFICATION_THREAD.QUORUM.length!==0){

        SYMBIOTE_META.STUFF_CACHE.set('QUORUM_AGGREGATED_PUB',Base58.encode(await bls.aggregatePublicKeys(SYMBIOTE_META.VERIFICATION_THREAD.QUORUM.map(Base58.decode))))

    }

    //__________________________________Load modules to work with hostchains_________________________________________

    let ticker = CONFIG.SYMBIOTE.CONNECTOR.TICKER,
    
        packID = CONFIG.SYMBIOTE.MANIFEST.HOSTCHAINS[ticker].PACK


    //Depending on packID load appropriate module
    if(CONFIG.EVM.includes(ticker)){
        
        let EvmHostChainConnector = (await import(`../../KLY_Hostchains/${packID}/connectors/evm.js`)).default
        
        //Set connector
        HOSTCHAIN.CONNECTOR=new EvmHostChainConnector(ticker)

        //Set monitor
        HOSTCHAIN.MONITOR=(await import(`../../KLY_Hostchains/${packID}/monitors/evm.js`)).default
        

    }else {

        //Also, set connector
        HOSTCHAIN.CONNECTOR=(await import(`../../KLY_Hostchains/${packID}/connectors/${ticker}.js`)).default

        //Also, set monitor
        HOSTCHAIN.MONITOR=(await import(`../../KLY_Hostchains/${packID}/monitors/${ticker}.js`)).default

    }

    if(!SYMBIOTE_META.VERIFICATION_THREAD.HOSTCHAIN_MONITORING) SYMBIOTE_META.VERIFICATION_THREAD.HOSTCHAIN_MONITORING=CONFIG.SYMBIOTE.MONITOR.MONITORING_PRESET




    //___________________Decrypt all private keys(for KLYNTAR and hostchains) to memory of process___________________

    


    await DECRYPT_KEYS(initSpinner).then(()=>
    
        //Print just first few bytes of keys to view that they were decrypted well.Looks like checksum
        LOG(`Private key on \x1b[36;1m${SYMBIOTE_ALIAS()}\x1b[32;1m was decrypted successfully`,'S')        
    
    ).catch(e=>{
    
        LOG(`Keys decryption failed.Please,check your password carefully.In the worst case-use your decrypted keys from safezone and repeat procedure of encryption via CLI\n${e}`,'F')
 
        process.exit(107)

    })



    //___________________________________________Load data from hostchain___________________________________________


        
    if(CONFIG.SYMBIOTE.BALANCE_VIEW){

        let ticker = CONFIG.SYMBIOTE.CONNECTOR.TICKER
        
        let spinner = ora({
       
            color:'red',
       
            prefixText:`\u001b[38;5;23m [${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]  \x1b[36;1mGetting balance for \x1b[32;1m${ticker}\x1b[36;1m - keep waiting\x1b[0m`
       
        }).start()

        let balance = await HOSTCHAIN.CONNECTOR.getBalance()
        
        spinner.stop()
        
        LOG(`Balance on hostchain \x1b[32;1m${
        
            ticker
        
        }\x1b[36;1m is \x1b[32;1m${
            
            CONFIG.SYMBIOTE.BALANCE_VIEW?balance:'<disabled>'
        
        }   \x1b[36;1m[${CONFIG.SYMBIOTE.STOP_HOSTCHAIN?'\x1b[31;1mSTOP':'\x1b[32;1mPUSH'}\x1b[36;1m]`,'I')
    
    }


    //____________________________________________GENERAL SYMBIOTE INFO____________________________________________


    LOG(fs.readFileSync(PATH_RESOLVE('images/events/syminfo.txt')).toString(),'S')

    LOG(`Local VERIFICATION_THREAD state is \x1b[32;1m${SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER.VALIDATOR} \u001b[38;5;168m}———{\x1b[32;1m ${SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER.INDEX} \u001b[38;5;168m}———{\x1b[32;1m ${SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER.HASH}`,'I')




    //Ask to approve current set of hostchains
    !CONFIG.PRELUDE.OPTIMISTIC
    &&        
    await new Promise(resolve=>
    
        readline.createInterface({input:process.stdin, output:process.stdout, terminal:false})
            
        .question(`\n ${`\u001b[38;5;${process.env.KLY_MODE==='main'?'23':'202'}m`}[${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]${'\x1b[36;1m'}  Do you agree with the current set of hostchains? Enter \x1b[32;1mYES\x1b[36;1m to continue ———> \x1b[0m`,resolve)
                
    ).then(answer=>answer!=='YES'&& process.exit(108))

    
    SIG_PROCESS={VERIFY:false,GENERATE:false}//we should track events in both threads-as in verification,as in generation

},



/*

    Function to get approvements from other validators to make your validator instance active again

*/
START_AWAKENING_PROCEDURE=()=>{
    
    fetch(CONFIG.SYMBIOTE.AWAKE_HELPER_NODE+'/getvalidators').then(r=>r.json()).then(async currentValidators=>{

        LOG(`Received list of current validators.Preparing to \x1b[31;1m<ALIVE_VALIDATOR>\x1b[32;1m procedure`,'S')

        let promises=[]

        //0. Initially,try to get pubkey => node_ip binding 
        currentValidators.forEach(
        
            pubkey => promises.push(GET_STUFF(pubkey))
            
        )
    
        let pureUrls = await Promise.all(promises.splice(0)).then(array=>array.filter(Boolean).map(x=>x.payload.url))
        
        //We'll use it to aggreage it to single tx and store locally to allow you to share over the network to include it to one of the block 
        let pingBackMsgs = []

        //Send message to each validator to return our generation thread "back to the game"

        /*
    
            AwakeRequestMessage looks like this
     
            {
                "V":<Pubkey of validator>
                "S":<Signature of hash of his metadata from VALIDATORS_METADATA> e.g. SIG(BLAKE3(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[<PubKey>]))
            }

        */
       

        let myMetadataHash = BLAKE3(JSON.stringify(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[CONFIG.SYMBIOTE.PUB]))

        let awakeRequestMessage = {
            
            V:CONFIG.SYMBIOTE.PUB,

            S:await SIG(myMetadataHash)
        
        },

        answers=[]

        for(let url of pureUrls) {

            pingBackMsgs.push(fetch(url+'/awakerequest',{method:'POST',body:JSON.stringify(awakeRequestMessage)})
            
                .then(r=>r.json())
                
                .then(resp=>

                    /*
                    
                        Response is

                            {P:CONFIG.SYMBIOTE.PUB,S:<Validator signa SIG(myMetadataHash)>}

                        We collect this responses and aggregate to add to the blocks to return our validators thread to game

                    */

                    VERIFY(myMetadataHash,resp.S,resp.P).then(_=>answers.push(resp)).catch(e=>false)

                )

                .catch(e=>
                
                    LOG(`Validator ${url} send no data to <ALIVE>. Caused error \n${e}`,'W')

                )

            )

        }



        await Promise.all(pingBackMsgs.splice(0))

        answers = answers.filter(Boolean)


        //Here we have verified signatures from validators
        

        let quorumNumbers=SYMBIOTE_META.VERIFICATION_THREAD.QUORUM.length,

            majority = Math.floor(quorumNumbers*(2/3))+1


        //Check if majority is not bigger than number of validators. It possible when there is small number of validators

        majority = majority > quorumNumbers ? quorumNumbers : majority



        //If we have majority votes - we can aggregate and share to "ressuect" our node
        if(answers.length>=majority){


            let pubkeys=[],

                nonDecoded=[],
            
                signatures=[],
                
                afkValidators=[]


            answers.forEach(descriptor=>{

                pubkeys.push(Base58.decode(descriptor.P))

                nonDecoded.push(descriptor.P)

                signatures.push(new Uint8Array(Buffer.from(descriptor.S,'base64')))

            })


            currentValidators.forEach(validator=>

                !nonDecoded.includes(validator)&&afkValidators.push(validator)

            )


            let aggregatedPub = Base58.encode(await bls.aggregatePublicKeys(pubkeys)),

                aggregatedSignatures = Buffer.from(await bls.aggregateSignatures(signatures)).toString('base64')


            //Make final verification
            if(await VERIFY(myMetadataHash,aggregatedSignatures,aggregatedPub)){

                LOG(`♛ Hooray!!! Going to share this TX to resurrect your node. Keep working :)`,'S')

                //Create AwakeMessage here

                let awakeMessage = {

                    T:'AWAKE',

                    V:CONFIG.SYMBIOTE.PUB, //AwakeMessage issuer(validator who want to activate his thread again)
                   
                    P:aggregatedPub, //Approver's aggregated BLS pubkey

                    S:aggregatedSignatures,

                    H:myMetadataHash,

                    A:afkValidators //AFK validators who hadn't vote. Need to agregate it to the ROOT_VALIDATORS_KEYS

                }


                //And share it

                fetch(CONFIG.SYMBIOTE.AWAKE_HELPER_NODE+'/vmessage',{

                    method:'POST',

                    body:JSON.stringify(awakeMessage)

                }).then(r=>r.text()).then(async response=>

                    response==='OK'
                    ?
                    LOG('Ok, validators received your \u001b[38;5;60m<AWAKE_MESSAGE>\x1b[32;1m, so soon your \x1b[31;1mGT\x1b[32;1m will be activated','S')
                    :
                    LOG(`Some error occured with sending \u001b[38;5;50m<AWAKE_MESSAGE>\u001b[38;5;3m - try to resend it manualy or change the endpoints(\u001b[38;5;167mAWAKE_HELPER_NODE\u001b[38;5;3m) to activate your \u001b[38;5;177mGT`,'W')

                ).catch(e=>

                    LOG(`Some error occured with sending \u001b[38;5;50m<AWAKE_MESSAGE>\u001b[38;5;3m - try to resend it manualy or change the endpoints(\u001b[38;5;167mAWAKE_HELPER_NODE\u001b[38;5;3m) to activate your \u001b[38;5;177mGT\n${e}`,'W')
                
                )


            }else LOG(`Aggregated verification failed. Try to activate your node manually`,'W')

        }

    }).catch(e=>LOG(`Can't get current validators set\n${e}`,'W'))

},




RUN_SYMBIOTE=async()=>{

    await PREPARE_SYMBIOTE()


    if(!CONFIG.SYMBIOTE.STOP_WORK){

        //0.Start verification process
        await START_VERIFICATION_THREAD()

        // setInterval(PROGRESS_CHECKER,CONFIG.SYMBIOTE.PROGRESS_CHECKER_INTERVAL)

        let promises=[]

        //Check if bootstrap nodes is alive
        CONFIG.SYMBIOTE.BOOTSTRAP_NODES.forEach(endpoint=>

            promises.push(
                        
                fetch(endpoint+'/addpeer',{method:'POST',body:JSON.stringify([CONFIG.SYMBIOTE.SYMBIOTE_ID,CONFIG.SYMBIOTE.MY_HOSTNAME])})
            
                    .then(res=>res.text())
            
                    .then(val=>LOG(val==='OK'?`Received pingback from \x1b[32;1m${endpoint}\x1b[36;1m. Node is \x1b[32;1malive`:`\x1b[36;1mAnswer from bootstrap \x1b[32;1m${endpoint}\x1b[36;1m => \x1b[34;1m${val}`,'I'))
            
                    .catch(error=>LOG(`Bootstrap node \x1b[32;1m${endpoint}\x1b[31;1m send no response or some error occured \n${error}`,'F'))
                        
            )

        )

        await Promise.all(promises.splice(0))


        //______________________________________________________RUN BLOCKS GENERATION PROCESS____________________________________________________________


        //Start generate blocks
        !CONFIG.SYMBIOTE.STOP_GENERATE_BLOCKS && setTimeout(()=>{
                
            global.STOP_GEN_BLOCKS_CLEAR_HANDLER=false
                
            GEN_BLOCKS_START_POLLING()
            
        },CONFIG.SYMBIOTE.BLOCK_GENERATION_INIT_DELAY)


        setTimeout(()=>

            SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.includes(CONFIG.SYMBIOTE.PUB) && START_AWAKENING_PROCEDURE()

        ,3000)



        //Run another thread to ask for blocks
        // UPD:We have decied to speed up this procedure during parallelism & plugins
        // GET_BLOCKS_FOR_FUTURE_WRAPPER()


    }

}