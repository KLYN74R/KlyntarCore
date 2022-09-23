import{BODY,SAFE_ADD,PARSE_JSON,BLAKE3} from '../../../KLY_Utils/utils.js'

import {BROADCAST,VERIFY,SIG,BLOCKLOG} from '../utils.js'

import MESSAGE_VERIFIERS from '../messagesVerifiers.js'

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
                if(block.c===CONFIG.SYMBIOTE.PUB || SYMBIOTE_META.QUORUM_COMMITMENTS_CACHE.get(block.с+":"+block.i) || block.i<SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[block.c]?.INDEX){

                    !a.aborted&&a.end('OK')

                    return
                
                }
                
                
                let hash=Block.genHash(block.c,block.e,block.v,block.i,block.p),
                
                
                    //Check if we can accept this block
                    allow=
            
                    typeof block.e==='object'&&typeof block.i==='number'&&typeof block.p==='string'&&typeof block.sig==='string'//make general lightweight overview
                    &&
                    SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[block.c]?.INDEX+CONFIG.SYMBIOTE.BLOCK_ACCEPTION_NORMAL_DIFFERENCE>block.i //check if block index is not too far from verification thread
                    &&
                    await VERIFY(hash,block.sig,block.c)//and finally-the most CPU intensive task
                    
                
                if(allow){
                
                    let blockID = block.c+":"+block.i

                    BLOCKLOG(`New \x1b[36m\x1b[41;1mblock\x1b[0m\x1b[32m accepted  \x1b[31m——│`,'S',hash,48,'\x1b[31m',block)
                    
                    //Store it locally-we'll work with this block later
                    SYMBIOTE_META.BLOCKS.get(blockID).catch(
                            
                        _ =>
                            
                            SYMBIOTE_META.BLOCKS.put(blockID,block).then(()=>
                            
                                Promise.all(BROADCAST('/block',block))
                                
                            ).catch(_=>{})
                         
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
        Fetch values about fees and MC from some decentralized sources
    
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

Here we receive the object with validator's pubkey and his array of commitments

{
    v:<PUBKEY>,
    p:[
        <Commitment1>,
        <Commitment2>,
        <Commitment3>,
        ...
        <CommitmentN>,
    ]
}

Commitment is object

{
    
    B:<BLOCK ID => <Address of validator whose block we sign>:<Index of block>
    
    S:<Signature => SIG(BLOCK_ID+":"+HASH)>
        
}

To verify that ValidatorX has received and confirmed block BLOCK_ID from ValidatorY we check

VERIFY(BLOCK_ID+":"+HASH,Signature,Validator's pubkey)

*/

            
setCommitments=a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async v=>{

    let payload=await BODY(v,CONFIG.MAX_PAYLOAD_SIZE),


        shouldAccept = 
        
        CONFIG.SYMBIOTE.TRIGGERS.ACCEPT_VALIDATORS_PROOFS
        &&
        (SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.includes(payload.v) || CONFIG.SYMBIOTE.TRUST_POOL_TO_ACCEPT_VALIDATORS_PROOFS.includes(payload.v))//to prevent spam - accept proofs only
        &&
        SYMBIOTE_META.QUORUM_COMMITMENTS_CACHE.size<CONFIG.SYMBIOTE.PROOFS_CACHE_SIZE



    if(shouldAccept){

        !a.aborted&&a.end('OK')

        //Go through the set of proofs
        for(let proof of payload.p){

            let proofRefInCache = SYMBIOTE_META.QUORUM_COMMITMENTS_CACHE.get(proof.B)

            //If some proofs from other validators exists - then reference to object in mapping should exist
            if(proofRefInCache){

                let checkIfVoteFromThisValidatorExists = proofRefInCache[proof.v]

                if(!checkIfVoteFromThisValidatorExists){

                    //If no votes from this validator - accept it
                    let [blockCreator,height] = proof.B.split(':'),
            
                        blockHash = await SYMBIOTE_META.BLOCKS.get(proof.B).then(block=>Block.genHash(block.c,block.e,block.v,block.i,block.p)).catch(e=>false),//await GET_STUFF('HASH:'+proof.B) || 
    
                        //Not to waste memory - don't accept block too far from current state of VERIFICATION_THREAD
                        shouldAcceptDueToHeight = (SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[blockCreator]?.INDEX+CONFIG.SYMBIOTE.VT_GT_NORMAL_DIFFERENCE)>(+height)    


                    if(shouldAcceptDueToHeight && await VERIFY(proof.B+":"+blockHash,proof.S,payload.v) && CONFIG.SYMBIOTE.VALIDATORS_PROOFS_TEMP_LIMIT_PER_BLOCK>Object.keys(proofRefInCache).length){

                        proofRefInCache.V[proof.v]=proof.S

                    }

                }

            }else{

                
                let blockHash = await SYMBIOTE_META.BLOCKS.get(proof.B).then(block=>Block.genHash(block.c,block.e,block.v,block.i,block.p)).catch(e=>false)//await GET_STUFF('HASH:'+proof.B) || 
    

                if(await VERIFY(proof.B+":"+blockHash,proof.S,payload.v)){

                    let proofTemplate = {V:{}}
                    
                    proofTemplate.V[payload.v]=proof.S
                    
                    SYMBIOTE_META.QUORUM_COMMITMENTS_CACHE.set(proof.B,proofTemplate)
                    
                }

            }

        }
            
    }else !a.aborted&&a.end('Route is off')
    

}),




// 0 - blockID(in format <BLS_ValidatorPubkey>:<height>)
// return simpleSignature

getCommitments=async(a,q)=>{

    //Check trigger
    if(CONFIG.SYMBIOTE.TRIGGERS.GET_COMMITMENTS){

        let blockID = q.getParameter(0)

        a.writeHeader('Access-Control-Allow-Origin','*').writeHeader('Cache-Control',`max-age=${CONFIG.SYMBIOTE.TTL.GET_COMMITMENTS}`).onAborted(()=>a.aborted=true)

        //Check if our proof presents in cache
        let ourProof = SYMBIOTE_META.QUORUM_COMMITMENTS_CACHE.get(blockID)?.V[CONFIG.SYMBIOTE.PUB]


        if(ourProof) !a.aborted && a.end(JSON.stringify({S:ourProof}))

        else{

            //Try to find proof from db - it should be aggregated proof
            let aggregatedProof = await SYMBIOTE_META.VALIDATORS_PROOFS.get(blockID).catch(e=>false)

            if(aggregatedProof) !a.aborted && a.end(JSON.stringify(aggregatedProof))

            else {

                //Else, check if block present localy and create a proof
                let block = await SYMBIOTE_META.BLOCKS.get(blockID).catch(e=>false), // or get from cache

                    threadID = blockID?.split(":")?.[0]

                //*✅ Add synchronization flag here to avoid giving proofs when validator decided to prepare to <SKIP_BLOCK> procedure
                if(block && SYMBIOTE_META.PROGRESS_CHECKER.BLOCK_TO_SKIP!==blockID && (CONFIG.SYMBIOTE.RESPONSIBILITY_ZONES.SHARE_PROOFS[threadID] || CONFIG.SYMBIOTE.RESPONSIBILITY_ZONES.SHARE_PROOFS.ALL)){

                    let blockHash = Block.genHash(block.c,block.e,block.v,block.i,block.p),
                    
                        proofSignature = await SIG(blockID+":"+blockHash)

                        !a.aborted && a.end(JSON.stringify({S:proofSignature}))

                        
                } else !a.aborted && a.end('No block')

            }
            
        }
           
    }else !a.aborted && a.end('Route is off')

},




//Function to allow validator to back to the game
//Accept simple signed message from "offline"(who has ACTIVE:false in metadata) validator to make his active again
awakeRequestMessageHandler=a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async v=>{
    
    /*
    
        AwakeRequestMessage looks like this
     
        {
            "V":<Pubkey of validator>
            "S":<Signature of hash of his metadata from VALIDATORS_METADATA> e.g. SIG(BLAKE3(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[<PubKey>]))
        }

    */
    let helloMessage=await BODY(v,CONFIG.PAYLOAD_SIZE),

        validatorVTMetadataHash=BLAKE3(JSON.stringify(SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[helloMessage?.V])),

        shouldSignToAlive =

            CONFIG.SYMBIOTE.TRIGGERS.ACCEPT_VOTE_TO_ALIVE
            &&
            SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.includes(helloMessage?.V)
            &&
            SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.includes(CONFIG.SYMBIOTE.PUB)
            &&
            !SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[helloMessage.V].BLOCKS_GENERATOR//Also,check if validator was marked as ACTIVE:false
            &&
            await VERIFY(validatorVTMetadataHash,helloMessage.S,helloMessage.V)


    if(shouldSignToAlive){

        let myAgreement = await SIG(validatorVTMetadataHash)

        !a.aborted&&a.end(JSON.stringify({P:CONFIG.SYMBIOTE.PUB,S:myAgreement}))
    
    }else !a.aborted&&a.end('Overview failed')

}),




getFinalization=a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async v=>{


}),




setFinalization=a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async v=>{


}),




getCheckpoint=a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async v=>{


}),




setCheckpoint=a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async v=>{


}),




//_____________________________________________________________AUXILARIES________________________________________________________________________




//[symbioteID,hostToAdd(initiator's valid and resolved host)]
addPeer=a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async v=>{
    
    let [symbiote,domain]=await BODY(v,CONFIG.PAYLOAD_SIZE)
    
    if(CONFIG.SYMBIOTE.SYMBIOTE_ID===symbiote && CONFIG.SYMBIOTE.TRIGGERS.ACCEPT_NEW_NODES && typeof domain==='string' && domain.length<=256){
        
        //Add more advanced logic in future
        let nodes=SYMBIOTE_META.PEERS
        
        if(!(nodes.includes(domain) || CONFIG.SYMBIOTE.BOOTSTRAP_NODES.includes(domain))){
            
            nodes.length<CONFIG.SYMBIOTE.MAX_CONNECTIONS
            ?
            nodes.push(domain)
            :
            nodes[~~(Math.random() * nodes.length)]=domain//if no place-paste instead of random node
    
            !a.aborted&&a.end('OK')
    
        }else !a.aborted&&a.end('Your node already in scope')
    
    }else !a.aborted&&a.end('Wrong types')

})








UWS_SERVER

.post('/awakerequest',awakeRequestMessageHandler)




//To accept/get aggregated object-proof where 2/3N+1 from QUORUM have produced commitments for block X by ValidatorY with hash <HASH>
//If validator from quorum has this finalization-proof - it'll never vote for another solution to add to checkpoint 
//If 2/3*N+1 of validators from quorum has such finalization proof - then, it's 100% garantee of non-rollback

//Returns aggregated FinalizationProof
.get('/getfinalization/:blockID',getFinalization)

//Accept FinalizationProof from external source. Verify it, and if OK - store locally
.post('/setfinalization',setFinalization)


//To accept/get commitments about accepting block X by ValidatorY with hash <HASH>
//Finalization proof consists of these commitments. If more than 2/3*N from QUORUM have produced such commitment for block X by ValidatorY with hash <HASH> - then,you can aggregate it
//and share to validators in QUORUM to prevent changes to checkpoints which will be published on hostchains

//Return own commitment for early accepted blockX by ValdatorY with hash <HASH>
.get('/getcommitments/:blockID',getCommitments)

//To accept commitments for blockX by ValdatorY with hash <HASH> from another validators in QUORUM
.post('/setcommitments',setCommitments)



//To get/set pointers on hostchains to track progress of verification thread

.post('/setcheckpoint',setCheckpoint)

.get('/getcheckpoint',getCheckpoint)




.post('/block',acceptBlocks)

.post('/event',acceptEvents)

.post('/addpeer',addPeer)