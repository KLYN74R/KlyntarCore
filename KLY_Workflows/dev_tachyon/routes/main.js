import{BODY,SAFE_ADD,PARSE_JSON,BLAKE3} from '../../../KLY_Utils/utils.js'

import {BROADCAST,VERIFY,SIG,BLOCKLOG} from '../utils.js'

import Block from '../essences/block.js'




let

//__________________________________________________________BASIC FUNCTIONAL_____________________________________________________________________




acceptBlocks=a=>{
    
    let total=0,buf=Buffer.alloc(0)
    
    //Check if we should accept this block.NOTE-use this option only in case if you want to stop accept blocks or override this process via custom runtime scripts or external services
    if(!CONFIG.SYMBIOTE.TRIGGERS.ACCEPT_BLOCKS){
        
        !a.aborted&&a.end('Route is off')
        
        return
    
    }
    
    a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async(chunk,last)=>{

        if(total+chunk.byteLength<=CONFIG.MAX_PAYLOAD_SIZE){
        
            buf=await SAFE_ADD(buf,chunk,a)//build full data from chunks
    
            total+=chunk.byteLength
        
            if(last){
            
                let block=await PARSE_JSON(buf)
                
                //No sense to verify & accept own block
                if(block.c===CONFIG.SYMBIOTE.PUB || SYMBIOTE_META.VALIDATORS_PROOFS_CACHE.get(block.с+":"+block.i) || block.i<SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[block.c]?.INDEX){

                    !a.aborted&&a.end('OK')

                    return
                
                }
                
                
                let hash=Block.genHash(block.c,block.e,block.i,block.p),
                
                
                    //Check if we can accept this block
                    allow=
            
                    typeof block.e==='object'&&typeof block.i==='number'&&typeof block.p==='string'&&typeof block.sig==='string'//make general lightweight overview
                    &&
                    SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[block.c]?.INDEX+CONFIG.SYMBIOTE.BLOCK_ACCEPTION_NORMAL_DIFFERENCE>block.i //check if block index is not too far from verification thread
                    &&
                    await VERIFY(hash,block.sig,block.c)//and finally-the most CPU intensive task
                    
                
                if(allow){
                
                    let blockID = block.с+":"+block.i

                    BLOCKLOG(`New \x1b[36m\x1b[41;1mblock\x1b[0m\x1b[32m accepted  \x1b[31m——│`,'S',hash,48,'\x1b[31m',block)
                    
                    //Store it locally-we'll work with this block later
                    SYMBIOTE_META.BLOCKS.get(blockID).catch(
                            
                        _ => SYMBIOTE_META.BLOCKS.put(blockID,block).then(()=>
                            
                            Promise.all(BROADCAST('/block',block))
                                
                        ).catch(e=>{})
                            
                    )

                   !a.aborted&&a.end('OK')

                }else !a.aborted&&a.end('Overview failed')
            
            }
        
        }else !a.aborted&&a.end('Payload limit')
    
    })

},
  
    


//Format of body : {symbiote,body}
//There is no 'c'(creator) field-we get it from tx
acceptEvents=a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async v=>{

    let {symbiote,event}=await BODY(v,CONFIG.PAYLOAD_SIZE)
    
    //Reject all txs if route is off and other guards methods
    if(!(CONFIG.SYMBIOTE.SYMBIOTE_ID===symbiote&&CONFIG.SYMBIOTE.TRIGGERS.ACCEPT_EVENTS) || typeof event?.c!=='string' || typeof event.n!=='number' || typeof event.s!=='string'){
        
        !a.aborted&&a.end('Overview failed')
        
        return
        
    }
    
    /*
    
        ...and do such "lightweight" verification here to prevent db bloating
        Anyway we can bump with some short-term desynchronization while perform operations over block
        Verify and normalize object
        Fetch values about fees and MC from some DEZ sources
    
        The second operand tells us:if buffer is full-it makes whole logical expression FALSE
        Also check if we have normalizer for this type of event

    
    */
    
    if(SYMBIOTE_META.MEMPOOL.length<CONFIG.SYMBIOTE.EVENTS_MEMPOOL_SIZE && SYMBIOTE_META.FILTERS[event.t]){

        let filtered=await SYMBIOTE_META.FILTERS[event.t](symbiote,event)

        if(filtered){

            !a.aborted&&a.end('OK')

            SYMBIOTE_META.MEMPOOL.push(event)
                        
        }else !a.aborted&&a.end('Post overview failed')

    }else !a.aborted&&a.end('Mempool is fullfilled or no such filter')

}),




//____________________________________________________________CONSENSUS STUFF__________________________________________________________________


//Function to accept updates of GT from validators,check,sign and share our agreement
//TODO:Provide some extra communication to prevent potential problems with forks


/*


To accept signatures of phantom blocks from validators

Here we receive the object with validator's pubkey and his array of proofs

{
    v:<PUBKEY>,
    p:[
        <PROOF_1>,
        <PROOF_2>,
        <PROOF_3>,
        ...
        <PROOF_N>,
    ]
}

Proof is object

{
    
    B:<BLOCK ID => <Address of validator whose block we sign>:<Index of block>
    
    S:<Signature => SIG(BLOCK_ID+":"+HASH)>
        
}

To verify that ValidatorX has received and confirmed block BLOCK_ID from ValidatorY we check

VERIFY(BLOCK_ID+":"+HASH,Signature,Validator's pubkey)

*/
acceptValidatorsProofs=a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async v=>{

    let payload=await BODY(v,CONFIG.MAX_PAYLOAD_SIZE),


        shouldAccept = 
        
        CONFIG.SYMBIOTE.TRIGGERS.ACCEPT_VALIDATORS_PROOFS
        &&
        (SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.includes(payload.v) || CONFIG.SYMBIOTE.TRUST_POOL_TO_ACCEPT_VALIDATORS_PROOFS.includes(payload.v))//to prevent spam - accept proofs only
        &&
        SYMBIOTE_META.VALIDATORS_PROOFS_CACHE.size<CONFIG.SYMBIOTE.PROOFS_CACHE_SIZE



    if(shouldAccept){

        !a.aborted&&a.end('OK')

        //Go through the set of proofs
        for(let proof of payload.p){

            let proofRefInCache = SYMBIOTE_META.VALIDATORS_PROOFS_CACHE.get(proof.B)

            //If some proofs from other validators exists - then reference to object in mapping should exist
            if(proofRefInCache){

                let checkIfVoteFromThisValidatorExists = proofRefInCache[proof.v]

                if(!checkIfVoteFromThisValidatorExists){

                    //If no votes from this validator - accept it
                    let [blockCreator,height] = proof.B.split(':'),
            
                        blockHash = await SYMBIOTE_META.BLOCKS.get(proof.B).then(block=>Block.genHash(block.c,block.e,block.i,block.p)).catch(e=>false),//await GET_STUFF('HASH:'+proof.B) || 
    
                        //Not to waste memory - don't accept block too far from current state of VERIFICATION_THREAD
                        shouldAcceptDueToHeight = (SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[blockCreator]?.INDEX+CONFIG.SYMBIOTE.VT_GT_NORMAL_DIFFERENCE)>(+height)    


                    if(shouldAcceptDueToHeight && await VERIFY(proof.B+":"+blockHash,proof.S,payload.v) && CONFIG.SYMBIOTE.VALIDATORS_PROOFS_TEMP_LIMIT_PER_BLOCK>Object.keys(proofRefInCache).length){

                        proofRefInCache.V[proof.v]=proof.S

                    }

                }

            }else{

                
                let blockHash = await SYMBIOTE_META.BLOCKS.get(proof.B).then(block=>Block.genHash(block.c,block.e,block.i,block.p)).catch(e=>false)//await GET_STUFF('HASH:'+proof.B) || 
    

                if(await VERIFY(proof.B+":"+blockHash,proof.S,payload.v)){

                    let proofTemplate = {V:{}}
                    
                    proofTemplate.V[payload.v]=proof.S
                    
                    SYMBIOTE_META.VALIDATORS_PROOFS_CACHE.set(proof.B,proofTemplate)
                    
                }

            }

        }
            
    }else !a.aborted&&a.end('Route is off')
    

}),




// 0 - blockID(in format <BLS_ValidatorPubkey>:<height>)
// return simpleSignature

createValidatorsProofs=async(a,q)=>{

    //Check trigger
    if(CONFIG.SYMBIOTE.TRIGGERS.CREATE_VALIDATORS_PROOFS){

        let blockID = q.getParameter(0)

        a.writeHeader('Access-Control-Allow-Origin','*').writeHeader('Cache-Control',`max-age=${CONFIG.SYMBIOTE.TTL.CREATE_VALIDATORS_PROOFS}`).onAborted(()=>a.aborted=true)

        //Check if our proof presents in db
        let ourProof = SYMBIOTE_META.VALIDATORS_PROOFS_CACHE.get(blockID)?.V[CONFIG.SYMBIOTE.PUB]


        if(ourProof) !a.aborted && a.end(ourProof)

        else{

            //Else, check if block present localy and create a proof

            let block = await SYMBIOTE_META.BLOCKS.get(blockID).catch(e=>false) // or get from cache

            if(block){

                let blockHash = Block.genHash(block.c,block.e,block.i,block.p),
                    
                    proofSignature = await SIG(blockID+":"+blockHash)

                !a.aborted && a.end(proofSignature)


                let proofTemplate = {V:{}}

                proofTemplate.V[CONFIG.SYMBIOTE.PUB] = proofSignature

                SYMBIOTE_META.VALIDATORS_PROOFS_CACHE.set(blockID,proofTemplate)               

            
            } else !a.aborted && a.end('No block')

        }
           
    }else !a.aborted && a.end('Route is off')

},





//0 - blockID(in format <BLS_ValidatorPubkey>:<height>)
getValidatorsProofs=async(a,q)=>{

    //Check triggers
    if(CONFIG.SYMBIOTE.TRIGGERS.GET_VALIDATORS_PROOFS){

        a.writeHeader('Access-Control-Allow-Origin','*').writeHeader('Cache-Control',`max-age=${CONFIG.SYMBIOTE.TTL.GET_VALIDATORS_PROOFS}`).onAborted(()=>a.aborted=true)

        let proofs = SYMBIOTE_META.VALIDATORS_PROOFS_CACHE.get(q.getParameter(0)) || await SYMBIOTE_META.VALIDATORS_PROOFS.get(q.getParameter(0)).catch(_=>false)

        console.log('QWERTY HERE ',proofs)

        !a.aborted && a.end(JSON.stringify(proofs))


    }else !a.aborted && a.end('Symbiote not supported')

},




//Function to allow validators to change status of validator to "offline" to stop verify his blocks and continue to verify blocks of other validators in VERIFICATION_THREAD
//Here validators exchange commitments among each other to skip some block to continue the VERIFICATION_THREAD
voteToSkipValidator=a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async v=>{

    /*
    
        Propose to skip is an object with the following structure 
        
        {
            V:<Validator who sent this message to you>,
            P:<CHECKSUM_OF_VT:BlockID to sign and to skip>,
            S:<Signature of blockID e.g. SIG(BLOCK_ID)>
        }
    
    */
    
    if(CONFIG.SYMBIOTE.TRIGGERS.ACCEPT_VOTE_TO_SKIP && SKIP_METADATA?.GOING_TO_SKIP_STATE){

        let {P:skipPointAndBlockID,V:validatorWhoPropose,S:proposerSignature} = await BODY(v,CONFIG.PAYLOAD_SIZE),

        //Decide should we check and perform this message
        overviewIsOk = 

            SYMBIOTE_META.VALIDATORS.includes(validatorWhoPropose)
            &&
            SKIP_METADATA.SKIP_POINT_AND_BLOCK_ID===skipPointAndBlockID
            &&
            await VERIFY(skipPointAndBlockID,proposerSignature,validatorWhoPropose)

        if(overviewIsOk){

            //Share with validator what we have
            !a.aborted&&a.end(JSON.stringify({V:CONFIG.SYMBIOTE.PUB,S:await SIG(skipPointAndBlockID)}))
    
            //Put to local cache of votes
            SKIP_METADATA.VOTES[validatorWhoPropose]=proposerSignature
        
        }else !a.aborted&&a.end('Overview failed')

        

    }else !a.aborted&&a.end('Node is not in <GOING_TO_SKIP_STATE> or TRIGGERS.ACCEPT_VOTE_TO_SKIP disabled')
        

}),





//Function to allow validator to back to the game
//Accept simple signed message from "offline"(who has ACTIVE:false in metadata) validator to make his active again
voteToAliveValidator=a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async v=>{
    
    /*
    
        helloMessage looks like this
     
        {
            "V":<Pubkey of validator>
            "S":<Signature of hash of his metadata from VALIDATORS_METADATA> e.g. SIG(BLAKE3(SYMBIOTE_META.VALIDATORS_METADATA[<PubKey>]))
        }

    */
    let helloMessage=await BODY(v,CONFIG.PAYLOAD_SIZE),

        validatorVTMetadataHash=BLAKE3(SYMBIOTE_META.VALIDATORS_METADATA[helloMessage?.V])

        shouldSignToAlive =

            CONFIG.SYMBIOTE.TRIGGERS.ACCEPT_VOTE_TO_ALIVE
            &&
            SYMBIOTE_META.VALIDATORS.includes(helloMessage?.V)
            &&
            SYMBIOTE_META.VALIDATORS.includes(CONFIG.SYMBIOTE.PUB)
            &&
            !SYMBIOTE_META.VALIDATORS_METADATA[helloMessage.V].ACTIVE//Also,check if validator was marked as ACTIVE:false
            &&
            await VERIFY(validatorVTMetadataHash,helloMessage.S,helloMessage.V)

    
    if(shouldSignToAlive){

        let myAgreement = await SIG(validatorVTMetadataHash)

        !a.aborted&&a.end(JSON.stringify({P:CONFIG.SYMBIOTE.PUB,S:myAgreement}))
    
    }else !a.aborted&&a.end('Overview failed')

}),



//_____________________________________________________________AUXILARIES________________________________________________________________________




//[symbioteID,hostToAdd(initiator's valid and resolved host)]
addNode=a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async v=>{
    
    let [symbiote,domain]=await BODY(v,CONFIG.PAYLOAD_SIZE)
    
    if(CONFIG.SYMBIOTE.SYMBIOTE_ID===symbiote && CONFIG.SYMBIOTE.TRIGGERS.ACCEPT_NEW_NODES && typeof domain==='string' && domain.length<=256){
        
        //Add more advanced logic in future
        let nodes=SYMBIOTE_META.NEAR
        
        if(!(nodes.includes(domain) || CONFIG.SYMBIOTE.BOOTSTRAP_NODES.includes(domain))){
            
            nodes.length<CONFIG.SYMBIOTE.MAX_CONNECTIONS
            ?
            nodes.push(domain)
            :
            nodes[~~(Math.random() * nodes.length)]=domain//if no place-paste instead of random node
    
            !a.aborted&&a.end('OK')
    
        }else !a.aborted&&a.end('Domain already in scope')
    
    }else !a.aborted&&a.end('Wrong types')

}),




//Passive mode enabled by default    
acceptHostchainsProofs=a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async v=>{
    
    if(!CONFIG.SYMBIOTE.TRIGGERS.ACCEPT_HOSTCHAINS_PROOFS){
     
        !a.aborted&&a.end('Route is off')
        
        return
    }
    
    
    /*
    
    VERIFY signature and perform further logic
    Also,broadcast to the other nodes if signature is valid
    
    */
    
    
    let {symbiote,ticker,KLYNTAR_HASH,HOSTCHAIN_HASH,INDEX,SIG}=await BODY(v,CONFIG.PAYLOAD_SIZE),
    
        workflowOk=true//by default.Can be changed in case if our local collapse is higher than index in proof
    
    if(CONFIG.SYMBIOTE.SYMBIOTE_ID===symbiote && await VERIFY(KLYNTAR_HASH+INDEX+HOSTCHAIN_HASH+ticker,SIG)){
    
        //Ok,so firstly we can assume that we have appropriate proof with everything we need
        
        let alreadyCheckedLocalProof=await SYMBIOTE_META.HOSTCHAINS_DATA.get(INDEX+ticker).catch(e=>{
    
            LOG(`No proof for \x1b[36;1m${INDEX} \u001b[38;5;3mblock \x1b[36;1m(hostchain:${ticker})\u001b[38;5;3m on \x1b[36;1m${SYMBIOTE_ALIAS()}\n${e}`,'W')
    
            return false
    
        })
    
        //If it's literally the same proof-just send OK
        if(alreadyCheckedLocalProof.KLYNTAR_HASH===KLYNTAR_HASH && alreadyCheckedLocalProof.INDEX===INDEX){
            
            !a.aborted&&a.end('OK')
    
            return
        }

        //If we're working higher than proof for some block we can check instantly
        SYMBIOTE_META.VERIFICATION_THREAD.FINALIZED_POINTER.INDEX>=INDEX
        &&
        await SYMBIOTE_META.BLOCKS.get(INDEX).then(async block=>{

            let validatorsBFTProof=await SYMBIOTE_METADATA.VALIDATORS_PROOFS.get(block.i)

            if(BLAKE3(Block.genHash(blockc.c,block.e,block.i,block.p)+validatorsBFTProof)===KLYNTAR_HASH && await HOSTCHAINS.get(ticker).checkTx(HOSTCHAIN_HASH,INDEX,KLYNTAR_HASH,symbiote).catch(
                            
                error => {
                    
                    LOG(`Can't check proof for \x1b[36;1m${INDEX}\u001b[38;5;3m on \x1b[36;1m${SYMBIOTE_ALIAS()}\u001b[38;5;3m to \x1b[36;1m${ticker}\u001b[38;5;3m.Check the error to get more info\n${error}`,'W')
                    
                    return -1
                
                })
            
            ) workflowOk = true
       
        }).catch(e=>
            
            //You also don't have ability to compare this if you don't have block locally
            LOG(`Can't check proof for \x1b[36;1m${INDEX}\u001b[38;5;3m on \x1b[36;1m${SYMBIOTE_ALIAS()}\u001b[38;5;3m to \x1b[36;1m${ticker}\u001b[38;5;3m coz you don't have local copy of block. Check your configs-probably your STORE_BLOCKS is false\n${e}`,'W')
                
        )    
        
        //False only if proof is failed
        if(workflowOk){
        
            CONFIG.SYMBIOTE.WORKFLOW_CHECK.HOSTCHAINS[ticker].STORE//if option that we should locally store proofs is true
            &&
            SYMBIOTE_META.HOSTCHAINS_DATA
            
                .put(INDEX+ticker,{KLYNTAR_HASH,HOSTCHAIN_HASH,SIG})
                
                .then(()=>LOG(`Proof for block \x1b[36;1m${INDEX}\x1b[32;1m on \x1b[36;1m${SYMBIOTE_ALIAS()}\x1b[32;1m to \x1b[36;1m${ticker}\x1b[32;1m verified and stored`,'S'))
                
                .catch(e=>LOG(`Can't write proof for block \x1b[36;1m${INDEX}\u001b[38;5;3m on \x1b[36;1m${SYMBIOTE_ALIAS()}\u001b[38;5;3m to \x1b[36;1m${ticker}\u001b[38;5;3m`,'W'))
        
        }else if(workflowOk!==-1){
            
            LOG(fs.readFileSync(PATH_RESOLVE('images/events/fork.txt')).toString(),'F')
          
            LOG(`<WARNING>-found fork.Block \x1b[36;1m${INDEX}\x1b[31;1m on \x1b[36;1m${SYMBIOTE_ALIAS()}\x1b[31;1m to \x1b[36;1m${ticker}`,'F')
            
            //Further logic.For example-send report to another host to call some trigger
            SEND_REPORT(symbiote,{height:INDEX,hostchain:ticker,hostchainTx:HOSTCHAIN_HASH})
        }
        
        !a.aborted&&a.end('OK')
        
        Promise.all(BROADCAST('/hc_proofs',{symbiote,ticker,KLYNTAR_HASH,HOSTCHAIN_HASH,INDEX,SIG},symbiote))
    
    }else !a.aborted&&a.end('Symbiote not supported or wrong signature')

})
 



UWS_SERVER

.post('/acceptvalidatorsproofs',acceptValidatorsProofs)

.get('/createvalidatorsproofs/:blockID',createValidatorsProofs)

.get('/proofs/:blockID',getValidatorsProofs)

.post('/hc_proofs',acceptHostchainsProofs)

.post('/votetoalive',voteToAliveValidator)

.post('/votetoskip',voteToSkipValidator)

.post('/block',acceptBlocks)

.post('/event',acceptEvents)

.post('/addnode',addNode)
