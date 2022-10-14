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
                
                
                let hash=Block.genHash(block.creator,block.time,block.events,block.index,block.prevHash),
                
                
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

        let filtered=await SYMBIOTE_META.FILTERS[event.t](event)

        if(filtered){

            !a.aborted&&a.end('OK')

            SYMBIOTE_META.MEMPOOL.push(event)
                        
        }else !a.aborted&&a.end('Post overview failed')

    }else !a.aborted&&a.end('Mempool is fullfilled or no such filter')

}),




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

            CONFIG.SYMBIOTE.TRIGGERS.ACCEPT_VALIDATORS_MESSAGES.AWAKE
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




//____________________________________________________________CONSENSUS STUFF__________________________________________________________________


/*

********************************************************************************
                                                                               *
To accept signatures of blocks from validators in quorum                       *
                                                                               *
Accept payload and answer with payload if exists in db or cache                *
                                                                               *
********************************************************************************


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

    H:<Block hash>
    
    S:<Signature => SIG(BLOCK_ID+":"+HASH)>
        
}

To verify that ValidatorX has received and confirmed block BLOCK_ID from ValidatorY we check

VERIFY(BLOCK_ID+":"+HASH,Signature,Validator's pubkey)


***********************************************************************************

We put these commitments to local mapping SYMBIOTE_META.COMMITMENTS. The key is blockID:HASH and value is mapping like this

{
    "<VALIDATOR-WHO-CREATE-COMMITMENT>":"<HIS_BLS_SIGNATURE>"
}

Once we notice that inner mapping size is 2/3N+1 where N is quorum size, we can create FINALIZATION_PROOF,aggregate these values and flush mapping

More info about FINALIZATION_PROOF available in description to POST /finalization


*/

commitments=a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async v=>{

    let payload=await BODY(v,CONFIG.MAX_PAYLOAD_SIZE),


        shouldAccept = 
        
        CONFIG.SYMBIOTE.TRIGGERS.ACCEPT_COMMITMENTS
        &&
        (SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS.includes(payload.v))//to prevent spam - accept proofs only
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
            
                        blockHash = await SYMBIOTE_META.BLOCKS.get(proof.B).then(block=>Block.genHash(block.creator,block.time,block.events,block.index,block.prevHash)).catch(e=>false),//await GET_STUFF('HASH:'+proof.B) || 
    
                        //Not to waste memory - don't accept block too far from current state of VERIFICATION_THREAD
                        shouldAcceptDueToHeight = (SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[blockCreator]?.INDEX+CONFIG.SYMBIOTE.VT_GT_NORMAL_DIFFERENCE)>(+height)    


                    if(shouldAcceptDueToHeight && await VERIFY(proof.B+":"+blockHash,proof.S,payload.v) && CONFIG.SYMBIOTE.VALIDATORS_PROOFS_TEMP_LIMIT_PER_BLOCK>Object.keys(proofRefInCache).length){

                        proofRefInCache.V[proof.v]=proof.S

                    }

                }

            }else{

                
                let blockHash = await SYMBIOTE_META.BLOCKS.get(proof.B).then(block=>Block.genHash(block.creator,block.time,block.events,block.index,block.prevHash)).catch(e=>false)//await GET_STUFF('HASH:'+proof.B) || 
    

                if(await VERIFY(proof.B+":"+blockHash,proof.S,payload.v)){

                    let proofTemplate = {V:{}}
                    
                    proofTemplate.V[payload.v]=proof.S
                    
                    SYMBIOTE_META.QUORUM_COMMITMENTS_CACHE.set(proof.B,proofTemplate)
                    
                }

            }

        }
            
    }else !a.aborted&&a.end('Route is off')
    

}),




/*


*************************************************************************************************************************
                                                                                                                        * 
Accept other FINALIZATION_PROOF from other quorum members and returns own FINALIZATION_PROOF if exists in local cache   *
                                                                                                                        *
*************************************************************************************************************************


We get FINALIZATION_PROOF from SYMBIOTE_META.FINALIZATION_PROOF mapping. We fullfilled this mapping inside POST /commitment mapping when some block PubX:Y:H(height=Y,creator=PubX,hash=H)
receive 2/3N+1 commitments

Structure of FINALIZATION_PROOF

{

    blockID:"7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta:0",

    hash:"0123456701234567012345670123456701234567012345670123456701234567",
    
    validator:"7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta", //creator of FINALIZATION_PROOF

    finalization_signa:SIG(blockID+hash+"FINALIZATION")

}

*****************************************************

To verify FINALIZATION_PROOF from some ValidatorX we need to do this steps:

1)Verify the finalization signa

    VERIFY(blockID+hash+"FINALIZATION",finalization_signa,Validator)


If verification is ok, add this FINALIZATION_PROOF to cache mapping SYMBIOTE_META.FINALIZATON_PROOFS

Key is blockID:Hash and value is inner mapping like this:

{
    "<VALIDATOR-WHO-CREATE-FINALIZATION-PROOF>":"<finalization_signa>"
}

*****************************************************

Also, when we notice that there are 2/3N+1 mapping size, we can aggregate it and create SUPER_FINALIZATION_PROOF.After that, we can clear these FINALIZATION_PROOFS from SYMBIOTE_META.FINALIZATON_PROOFS

More detailed about it in description to the next route



*/

finalization=a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async v=>{

    

}),



/*

****************************************************************
                                                               *
Accept SUPER_FINALIZATION_PROOF or send it if exists locally   *
                                                               *
****************************************************************

    Latest bastion. This POST /superfinalization route share SUPER_FINALIZATION_PROOF from SYMBIOTE_META.SUPER_FINALIZATION_PROOFS

    If we have SUPER_FINZALIZATION_PROOF - response with it

    If we incoming payload is SUPER_FINZALIZATION_PROOF - then verify it and if OK,
        
        store locally and delete other FINALIZATION_PROOFS from local caches(because no more sense to store them when we already have SUPER_FINALIZATION_PROOF)




    Key is blockID:Hash and value is object like this

{
    
    aggregatedPub:"7cBETvyWGSvnaVbc7ZhSfRPYXmsTzZzYmraKEgxQMng8UPEEexpvVSgTuo8iza73oP",

    aggregatedSigna:"kffamjvjEg4CMP8VsxTSfC/Gs3T/MgV1xHSbP5YXJI5eCINasivnw07f/lHmWdJjC4qsSrdxr+J8cItbWgbbqNaM+3W4HROq2ojiAhsNw6yCmSBXl73Yhgb44vl5Q8qD",

    afkValidators:[]

}


To verify SUPER_FINALIZATION_PROOF we should follow several steps:

1) Verify aggregated FINALIZATION_PROOFs

    VERIFY(blockID+hash+"FINALIZATION",aggregatedPub,aggregatedSigna)


2) Make sure, that QUORUM_ROOT_KEY === Aggregate(aggregatedPub,afkValidators)


3) Make sure that it's majority solution by doing QUORUM_SIZE-afkValidators >= 2/3N+1

*/
superFinalization=async(a,q)=>{



},


/*


Accept checkpoints from other validators in quorum and returns own version as answer
! Check the trigger START_SHARING_CHECKPOINT

We take checkpoints from SYMBIOTE_META.CHECKPOINTS

*/
checkpoint=a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async v=>{


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

.post('/superfinalization',superFinalization)

.post('/finalization',finalization)

.post('/commitments',commitments)

.post('/checkpoint',checkpoint)

.post('/block',acceptBlocks)

.post('/event',acceptEvents)

.post('/addpeer',addPeer)