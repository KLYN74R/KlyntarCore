import{BODY,SAFE_ADD,PARSE_JSON, BLAKE3} from '../../../KLY_Utils/utils.js'

import {BROADCAST,VERIFY,SIG,BLOCKLOG,GET_MAJORITY} from '../utils.js'

import bls from '../../../KLY_Utils/signatures/multisig/bls.js'

import OPERATIONS_VERIFIERS from '../operationsVerifiers.js'

import Block from '../essences/block.js'





let

//__________________________________________________________BASIC FUNCTIONAL_____________________________________________________________________



/*

[Description]:
    Accept blocks
  
[Accept]:

    Blocks
  
    {
        creator:'7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta',
        time:1666744452126,
        events:[
            event1,
            event2,
            event3,
        ]
        index:1337,
        prevHash:'0123456701234567012345670123456701234567012345670123456701234567',
        sig:'jXO7fLynU9nvN6Hok8r9lVXdFmjF5eye09t+aQsu+C/wyTWtqwHhPwHq/Nl0AgXDDbqDfhVmeJRKV85oSEDrMjVJFWxXVIQbNBhA7AZjQNn7UmTI75WAYNeQiyv4+R4S'
    }


[Response]:

    SIG(blockID+hash) => jXO7fLynU9nvN6Hok8r9lVXdFmjF5eye09t+aQsu+C/wyTWtqwHhPwHq/Nl0AgXDDbqDfhVmeJRKV85oSEDrMjVJFWxXVIQbNBhA7AZjQNn7UmTI75WAYNeQiyv4+R4S

    <OR> nothing

*/
acceptBlocks=response=>{
    
    let total=0,buffer=Buffer.alloc(0)
    
    //Check if we should accept this block.NOTE-use this option only in case if you want to stop accept blocks or override this process via custom runtime scripts or external services
    if(!CONFIG.SYMBIOTE.TRIGGERS.ACCEPT_BLOCKS){
        
        !response.aborted && response.end('Route is off')
        
        return
    
    }
    
    response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async(chunk,last)=>{

        if(total+chunk.byteLength<=CONFIG.MAX_PAYLOAD_SIZE){
        
            buffer=await SAFE_ADD(buffer,chunk,response)//build full data from chunks
    
            total+=chunk.byteLength
        
            if(last){
            
                let block=await PARSE_JSON(buffer),
                
                    hash=Block.genHash(block),

                    myCommitment = SYMBIOTE_META.COMMITMENTS.get(block.сreator+":"+block.index)?.get(CONFIG.SYMBIOTE.PUB),

                    // index must be bigger than in latest known height in checkpoint. Otherwise - no sense to generate commitment

                    isFreshEnough = block.index >= SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.PAYLOAD.VALIDATORS_METADATA[block.creator]?.INDEX 
                

                if(myCommitment || !isFreshEnough){

                    !response.aborted && response.end(myCommitment)

                    return
                
                }
                
                //Otherwise - check if we can accept this block
                
                let allow=
            
                    typeof block.events==='object' && typeof block.index==='number' && typeof block.prevHash==='string' && typeof block.sig==='string'//make general lightweight overview
                    &&
                    await VERIFY(hash,block.sig,block.creator)//and finally-the most CPU intensive task
                    &&
                    await SYMBIOTE_META.BLOCKS.get(block.creator+":"+(block.index-1)).then(prevBlock=>{

                        //Compare hashes to make sure it's a chain

                        let prevHash = Block.genHash(prevBlock)

                        return prevHash === block.prevHash

                    })


                
                if(allow){
                
                    let blockID = block.creator+":"+block.index

                    BLOCKLOG(`New \x1b[36m\x1b[41;1mblock\x1b[0m\x1b[32m accepted  \x1b[31m——│`,'S',hash,48,'\x1b[31m',block)
                    
                    //Store it locally-we'll work with this block later
                    SYMBIOTE_META.BLOCKS.get(blockID).catch(
                            
                        _ =>
                            
                            SYMBIOTE_META.BLOCKS.put(blockID,block).then(()=>
                            
                                Promise.all(BROADCAST('/block',block))
                                
                            ).catch(_=>{})
                         
                    )

                    let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID
                    
                    let commitment = await SIG(blockID+hash+qtPayload)

                    !response.aborted && response.end(commitment)


                }else !response.aborted && response.end('Overview failed')
            
            }
        
        }else !response.aborted && response.end('Payload limit')
    
    })

},

    


//Format of body : {symbiote,body}
//There is no <creator> field-we get it from tx
acceptEvents=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    let {symbiote,event}=await BODY(bytes,CONFIG.PAYLOAD_SIZE)
    
    //Reject all txs if route is off and other guards methods
    if(!(CONFIG.SYMBIOTE.SYMBIOTE_ID===symbiote&&CONFIG.SYMBIOTE.TRIGGERS.ACCEPT_EVENTS) || typeof event?.creator!=='string' || typeof event.nonce!=='number' || typeof event.sig!=='string'){
        
        !response.aborted && response.end('Overview failed')
        
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
    
    if(SYMBIOTE_META.MEMPOOL.length<CONFIG.SYMBIOTE.EVENTS_MEMPOOL_SIZE && SYMBIOTE_META.FILTERS[event.type]){

        let filtered=await SYMBIOTE_META.FILTERS[event.type](event)

        if(filtered){

            !response.aborted && response.end('OK')

            SYMBIOTE_META.MEMPOOL.push(event)
                        
        }else !response.aborted && response.end('Post overview failed')

    }else !response.aborted && response.end('Mempool is fullfilled or no such filter')

}),




/*

[Description]:
    
    Accept aggregated commitments which proofs us that 2/3N+1 has the same block and generate FINALIZATION_PROOF => SIG(blockID+hash+'FINALIZATION')

[Accept]:

Aggregated version of commitments

    {
        
        blockID:"7cBETvyWGSvnaVbc7ZhSfRPYXmsTzZzYmraKEgxQMng8UPEEexpvVSgTuo8iza73oP:1337",

        blockHash:"0123456701234567012345670123456701234567012345670123456701234567",
        
        aggregatedPub:"7cBETvyWGSvnaVbc7ZhSfRPYXmsTzZzYmraKEgxQMng8UPEEexpvVSgTuo8iza73oP",

        aggregatedSigna:"kffamjvjEg4CMP8VsxTSfC/Gs3T/MgV1xHSbP5YXJI5eCINasivnw07f/lHmWdJjC4qsSrdxr+J8cItbWgbbqNaM+3W4HROq2ojiAhsNw6yCmSBXl73Yhgb44vl5Q8qD",

        afkValidators:[]

    }


___________________________Verification steps___________________________


[+] Verify the signa

[+] Make sure that at least 2/3N+1 is inside aggregated key/signa. Use afkValidators array for this and QUORUM_THREAD.QUORUM

[+] RootPub is equal to QUORUM_THREAD rootpub



[Response]:

    If everything is OK - response with signa SIG(blockID+hash+"FINALIZATION")

    
*/
finalization=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    let aggregatedCommitments=await BODY(bytes,CONFIG.PAYLOAD_SIZE)
    
    if(CONFIG.SYMBIOTE.TRIGGERS.SHARE_FINALIZATION_PROOF){

        let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

        let signaIsOk = await bls.singleVerify(aggregatedCommitments.blockID+aggregatedCommitments.blockHash+qtPayload,aggregatedCommitments.aggregatedPub,aggregatedCommitments.aggregatedSigna).catch(_=>false)

        let majorityIsOk = GET_MAJORITY('QUORUM_THREAD') >= SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM.length-aggregatedCommitments.afkValidators.length

        let rootPubIsEqualToReal = bls.aggregatePublicKeys([aggregatedCommitments.aggregatedPub,...aggregatedCommitments.afkValidators]) === SYMBIOTE_META.STUFF_CACHE.get('QT_ROOTPUB')


        if(signaIsOk && majorityIsOk && rootPubIsEqualToReal){

            //TODO: Store aggregated commitments somewhere localy to have proofs in future

            let finalizationSigna = await SIG(aggregatedCommitments.blockID+aggregatedCommitments.blockHash+'FINALIZATION'+qtPayload)

            // Put to the checkpoints manager
            let [blockCreator,blockIndex] = aggregatedCommitments.blockID.split(':')

            blockIndex = +blockIndex

            if(!SYMBIOTE_META.CHECKPOINTS_MANAGER.has(blockCreator)) SYMBIOTE_META.CHECKPOINTS_MANAGER.set(blockCreator,{INDEX:-1,HASH:''})

            let handler = SYMBIOTE_META.CHECKPOINTS_MANAGER.get(blockCreator)

            if(blockIndex>handler.INDEX){

                handler.INDEX = blockIndex

                handler.HASH = aggregatedCommitments.blockHash

            }

            !response.aborted && response.end(finalizationSigna)

        }else !response.aborted && response.end('Something wrong')


    }else !response.aborted && response.end('Route is off')

}),




/*

****************************************************************
                                                               *
Accept SUPER_FINALIZATION_PROOF or send if it exists locally   *
                                                               *
****************************************************************


*/
superFinalization=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID
   
    let possibleSuperFinalizationProof=await BODY(bytes,CONFIG.PAYLOAD_SIZE)

    let signaIsOk = await bls.singleVerify(possibleSuperFinalizationProof.blockID+possibleSuperFinalizationProof.blockHash+'FINALIZATION'+qtPayload,possibleSuperFinalizationProof.aggregatedPub,possibleSuperFinalizationProof.aggregatedSigna).catch(_=>false)

    let majorityIsOk = GET_MAJORITY('QUORUM_THREAD') >= SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM.length-possibleSuperFinalizationProof.afkValidators.length

    let rootPubIsEqualToReal = bls.aggregatePublicKeys([possibleSuperFinalizationProof.aggregatedPub,...possibleSuperFinalizationProof.afkValidators]) === SYMBIOTE_META.STUFF_CACHE.get('QT_ROOTPUB')


    if(signaIsOk && majorityIsOk && rootPubIsEqualToReal){

        SYMBIOTE_META.SUPER_FINALIZATION_PROOFS.put(possibleSuperFinalizationProof.blockID,possibleSuperFinalizationProof)

        !response.aborted && response.end('OK')

    }else !response.aborted && response.end('Something wrong')


}),




/*

To return SUPER_FINALIZATION_PROOF related to some block PubX:Index with hash <HASH>

Only in case when we have SUPER_FINALIZATION_PROOF we can verify block with the 100% garantee that it's the part of valid subchain and will be included to checkpoint 

Params:

    [0] - blockID:hash

Returns:

    {
        aggregatedSignature:<>, // blockID+hash+"FINALIZATION"
        aggregatedPub:<>,
        afkValidators
        
    }

*/
getSuperFinalization=async(response,request)=>{

    response.onAborted(()=>response.aborted=true)

    if(CONFIG.SYMBIOTE.TRIGGERS.GET_SUPER_FINALIZATION_PROOFS){

        let superFinalizationProof = await SYMBIOTE_META.SUPER_FINALIZATION_PROOFS.get(request.getParameter(0)).catch(_=>false)

        if(superFinalizationProof){

            response.end(JSON.stringify(superFinalizationProof))

        }else response.end('No proof')

    }else response.end('Route is off')

},




/*

Accept checkpoints from other validators in quorum and returns own version as answer
! Check the trigger START_SHARING_CHECKPOINT

[Accept]:


{
            
            PREV_CHECKPOINT_PAYLOAD_HASH: SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH,
            
            VALIDATORS_METADATA: {
                
                '7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta': {INDEX,HASH}

                /..other data
            
            },
            OPERATIONS: GET_SPEC_EVENTS(),
            OTHER_SYMBIOTES: {}
        
}

To sign it => SIG(BLAKE3(JSON.stringify(<PROPOSED>)))


[Response]

Responses might be various

[+] If we agree with everything        
                
{
    type:'OK',
    sig:<BLS signature>,
    pubKey
}

[+] Otherwise, response might be 

If there is no such operation in mempool

{
    type:'DEL_SPEC_OP'
    id:<index of special operation in potentialCheckpointPayload.OPERATIONS>
    pubKey
}

If we have proof that for a specific validator we have height with bigger index(longer chain)

{
    type:'HEIGHT_UPDATE'
                
    index:<index of special operation in potentialCheckpointPayload.OPERATIONS>,
    hash:<>,
    aggregatedSig:<>,
    aggregatedPub:<>,
    afkValidators:<>
    pubKey
            
}

    First of all, we do the HEIGHT_UPDATE operations and repeat grabbing checkpoints.
    We execute the DEL_SPEC_OP transactions only in case if no valid <HEIGHT_UPDATE> operations were received during round.

{



}

*/
checkpoint=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    let checkpointProposition=await BODY(bytes,CONFIG.MAX_PAYLOAD_SIZE)

}),




/*

To return payload of some checkpoint by ID

Params:

    [0] - checkpointID


Returns:

    {
      PREV_CHECKPOINT_PAYLOAD_HASH: '',
      VALIDATORS_METADATA: [Object],
      OPERATIONS: [],
      OTHER_SYMBIOTES: {}
    }

*/
getPayloadForCheckpoint=async(response,request)=>{

    response.onAborted(()=>response.aborted=true)

    if(CONFIG.SYMBIOTE.TRIGGERS.GET_PAYLOAD_FOR_CHECKPOINT){

        let checkpointID = request.getParameter(0),

            checkpoint = await SYMBIOTE_META.CHECKPOINTS.get(checkpointID).catch(_=>false)

        if(checkpoint){

            response.end(JSON.stringify(checkpoint.PAYLOAD))

        }response.end('No checkpoint')

    }else response.end('Route is off')

},


/*

Body is


{
    
    type:<SPECIAL_OPERATION id> STAKING_CONTRACT_CALL | SLASH_UNSTAKE | UPDATE_RUBICON , etc. See operationsVerifiers.js
    
    payload:{}

}

    * Payload has different structure depending on type

*/

specialOperationsAccept=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    let operation=await BODY(bytes,CONFIG.MAX_PAYLOAD_SIZE)


    //Verify and if OK - put to SPECIAL_OPERATIONS_MEMPOOL
    if(CONFIG.SYMBIOTE.TRIGGERS.OPERATIONS_ACCEPT && SYMBIOTE_META.SPECIAL_OPERATIONS_MEMPOOL.length<CONFIG.SYMBIOTE.SPECIAL_OPERATIONS_MEMPOOL_SIZE && OPERATIONS_VERIFIERS[operation.type]){

        let isOk = await OPERATIONS_VERIFIERS[operation.type](operation.payload,true,false) //it's just verify without state changes

        if(isOk){

            let payloadHash = BLAKE3(JSON.stringify(operation.payload))

            operation.id = payloadHash


            SYMBIOTE_META.SPECIAL_OPERATIONS_MEMPOOL.push(operation)

            response.end('OK')
        
        }else response.end('Verification failed')

    }else response.end('Route is off')

}),



/*

To add node to local set of peers to exchange data with

Params:

    [symbioteID,hostToAdd(initiator's valid and resolved host)]

    [0] - symbiote ID       EXAMPLE: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
    [1] - host to add       EXAMPLE: http://example.org | https://some.subdomain.org | http://cafe::babe:8888


Returns:

    'OK' - if node was added to local peers
    '<MSG>' - if some error occured

*/

addPeer=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{
    
    let [symbiote,domain]=await BODY(bytes,CONFIG.PAYLOAD_SIZE)
    
    if(CONFIG.SYMBIOTE.SYMBIOTE_ID===symbiote && CONFIG.SYMBIOTE.TRIGGERS.ACCEPT_NEW_NODES && typeof domain==='string' && domain.length<=256){
        
        //Add more advanced logic in future(or use plugins - it's even better)
        let nodes=SYMBIOTE_META.PEERS
        
        if(!(nodes.includes(domain) || CONFIG.SYMBIOTE.BOOTSTRAP_NODES.includes(domain))){
            
            nodes.length<CONFIG.SYMBIOTE.MAX_CONNECTIONS
            ?
            nodes.push(domain)
            :
            nodes[~~(Math.random() * nodes.length)]=domain//if no place-paste instead of random node
    
            !response.aborted && response.end('OK')
    
        }else !response.aborted && response.end('Your node already in scope')
    
    }else !response.aborted && response.end('Wrong types')

})








UWS_SERVER

//1st stage - accept block and response with the commitment

//2nd stage - accept aggregated commitments and response with the FINALIZATION_PROOF
.post('/finalization',finalization)

//3rd stage - logic with super finalization proofs. Accept SUPER_FINALIZATION_PROOF(aggregated 2/3N+1 FINALIZATION_PROOFs from QUORUM members)
.post('/super_finalization',superFinalization)

.get('/get_super_finalization',getSuperFinalization)


.get('/get_payload_for_checkpoint/:CHECKPOINT_ID',getPayloadForCheckpoint)


.post('/special_operations',specialOperationsAccept)

.post('/checkpoint',checkpoint)

.post('/block',acceptBlocks)

.post('/event',acceptEvents)

.post('/addpeer',addPeer)