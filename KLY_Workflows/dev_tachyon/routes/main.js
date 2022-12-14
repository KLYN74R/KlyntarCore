import{BODY,SAFE_ADD,PARSE_JSON,BLAKE3} from '../../../KLY_Utils/utils.js'

import {BROADCAST,BLS_VERIFY,SIG,BLOCKLOG,GET_MAJORITY} from '../utils.js'

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

                    myCommitment = await SYMBIOTE_META.COMMITMENTS_AND_FINALIZAION_PROOFS.get(block.сreator+":"+block.index).catch(_=>false)||'No commitment',

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
                    await BLS_VERIFY(hash,block.sig,block.creator)//and finally-the most CPU intensive task
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

                    let canShareCommitment = !SYMBIOTE_META.SKIP_PROCEDURE_STAGE_1.get(qtPayload)?.has(block.creator)

                    if(QUORUM_MEMBER_MODE && canShareCommitment){

                        //Put to local storage to prevent double voting
                        await SYMBIOTE_META.COMMITMENTS_AND_FINALIZAION_PROOFS.put(block.сreator+":"+block.index,commitment)

                        !response.aborted && response.end(commitment)

                    }else !response.aborted && response.end('Something wrong')

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
    if(!(CONFIG.SYMBIOTE.SYMBIOTE_ID===symbiote && CONFIG.SYMBIOTE.TRIGGERS.ACCEPT_EVENTS) || typeof event?.creator!=='string' || typeof event.nonce!=='number' || typeof event.sig!=='string'){
        
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

    If everything is OK - response with signa SIG(blockID+hash+'FINALIZATION'+QT.CHECKPOINT.HEADER.PAYLOAD_HASH+QT.CHECKPOINT.HEADER.ID)

    
*/
finalization=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    let aggregatedCommitments=await BODY(bytes,CONFIG.PAYLOAD_SIZE)
    
    if(CONFIG.SYMBIOTE.TRIGGERS.SHARE_FINALIZATION_PROOF && !QUORUM_MEMBER_MODE){

        let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

        let {aggregatedPub,aggregatedSignature,afkValidators} = aggregatedCommitments



        let signaIsOk = await bls.singleVerify(aggregatedCommitments.blockID+aggregatedCommitments.blockHash+qtPayload,aggregatedPub,aggregatedSignature).catch(_=>false)

        let majorityIsOk = GET_MAJORITY('QUORUM_THREAD') >= SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM.length-afkValidators.length

        let rootPubIsEqualToReal = bls.aggregatePublicKeys([aggregatedPub,...afkValidators]) === SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB')


        
        if(signaIsOk && majorityIsOk && rootPubIsEqualToReal){

            //TODO: Store aggregated commitments somewhere localy to have proofs in future

            let finalizationSigna = await SIG(aggregatedCommitments.blockID+aggregatedCommitments.blockHash+'FINALIZATION'+qtPayload)

            // Put to the checkpoints manager
            let [blockCreator,blockIndex] = aggregatedCommitments.blockID.split(':')

            blockIndex = +blockIndex

            let handler = SYMBIOTE_META.CHECKPOINTS_MANAGER.get(blockCreator)

            if(blockIndex>handler.INDEX){

                handler.INDEX = blockIndex

                handler.HASH = aggregatedCommitments.blockHash

                handler.FINALIZATION_PROOF = {

                    aggregatedPub,
                    aggregatedSignature,
                    afkValidators

                }

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

    let signaIsOk = await bls.singleVerify(possibleSuperFinalizationProof.blockID+possibleSuperFinalizationProof.blockHash+'FINALIZATION'+qtPayload,possibleSuperFinalizationProof.aggregatedPub,possibleSuperFinalizationProof.aggregatedSignature).catch(_=>false)

    let majorityIsOk = GET_MAJORITY('QUORUM_THREAD') >= SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM.length-possibleSuperFinalizationProof.afkValidators.length

    let rootPubIsEqualToReal = bls.aggregatePublicKeys([possibleSuperFinalizationProof.aggregatedPub,...possibleSuperFinalizationProof.afkValidators]) === SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB')


    if(signaIsOk && majorityIsOk && rootPubIsEqualToReal){

        SYMBIOTE_META.SUPER_FINALIZATION_PROOFS_DB.put(possibleSuperFinalizationProof.blockID,possibleSuperFinalizationProof)

        !response.aborted && response.end('OK')

    }else !response.aborted && response.end('Something wrong')


}),




/*

To return SUPER_FINALIZATION_PROOF related to some block PubX:Index

Only in case when we have SUPER_FINALIZATION_PROOF we can verify block with the 100% garantee that it's the part of valid subchain and will be included to checkpoint 

Params:

    [0] - blockID

Returns:

    {
        aggregatedSignature:<>, // blockID+hash+'FINALIZATION'+QT.CHECKPOINT.HEADER.PAYLOAD_HASH+QT.CHECKPOINT.HEADER.ID
        aggregatedPub:<>,
        afkValidators
        
    }

*/
getSuperFinalization=async(response,request)=>{

    response.onAborted(()=>response.aborted=true)

    if(CONFIG.SYMBIOTE.TRIGGERS.GET_SUPER_FINALIZATION_PROOFS){

        let superFinalizationProof = await SYMBIOTE_META.SUPER_FINALIZATION_PROOFS_DB.get(request.getParameter(0)).catch(_=>false)

        if(superFinalizationProof){

            response.end(JSON.stringify(superFinalizationProof))

        }else response.end('No proof')

    }else response.end('Route is off')

},




/*

To return SUPER_FINALIZATION_PROOF related to the latest block we have 

Only in case when we have SUPER_FINALIZATION_PROOF we can verify block with the 100% garantee that it's the part of valid subchain and will be included to checkpoint 

Params:

Returns:

    {
        
        latestFullyFinalizedHeight, // height of block that we already finalized. Also, below you can see the SUPER_FINALIZATION_PROOF. We need it as a quick proof that majority have voted for this segment of subchain
        
        latestHash:<>,

        superFinalizationProof:{
            
            aggregatedSignature:<>, // blockID+hash+'FINALIZATION'+QT.CHECKPOINT.HEADER.PAYLOAD_HASH+QT.CHECKPOINT.HEADER.ID
            aggregatedPub:<>,
            afkValidators
        
        }
    
    
    }

*/
healthChecker = async response => {

    response.onAborted(()=>response.aborted=true)

    if(CONFIG.SYMBIOTE.TRIGGERS.GET_HEALTH_CHECKER){

        // Get the latest SUPER_FINALIZATION_PROOF that we have
        let appropriateDescriptor = SYMBIOTE_META.STATIC_STUFF_CACHE.get('BLOCK_SENDER_HANDLER')

        if(!appropriateDescriptor) response.end(`Still haven't start the procedure of grabbing finalization proofs`)


        
        let latestFullyFinalizedHeight = appropriateDescriptor.height-1

        let block = await SYMBIOTE_META.BLOCKS.get(latestFullyFinalizedHeight).catch(_=>false)

        let superFinalizationProof = await SYMBIOTE_META.SUPER_FINALIZATION_PROOFS_DB.get(CONFIG.SYMBIOTE.PUB+":"+latestFullyFinalizedHeight).catch(_=>false)

        
        
        if(superFinalizationProof && block){

            let latestHash = Block.genHash(block)

            let healthProof = {latestFullyFinalizedHeight,latestHash,superFinalizationProof}

            response.end(JSON.stringify(healthProof))

        }else response.end('No proof')

    }else response.end('Route is off')

},




/*

Function to accept potential checkpoints

*/
potentialCheckpoint=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    let potentialCheckpoint=await BODY(bytes,CONFIG.MAX_PAYLOAD_SIZE)


}),



/*

[Info]:

    Route to accept requests from other quorum members about development of subchains.

    For this, we should response like this


[Accept]:

    {
        session:<32-bytes random hex session ID>,
        
        initiator:<BLS pubkey of quorum member who initiated skip procedure>,
        
        requestedSubchain:<BLS pubkey of subchain that initiator wants to get latest info about>,
        
        height:<block height of subchain on which initiator stopped>
        
        sig:SIG(session+requestedSubchain+height)
    
    }

[Response]:

    [+] In case our SYMBIOTE_META.HEALTH_MONITORING.get(<SUBCHAIN_ID>).LAST_SEEN is too old - we can vote to init skip procedure
        For this - response with a signature like this SIG('SKIP_STAGE_1'+session+requestedSubchain+initiator)

    [+] If timeout of AFK from subchain is not too old - then response with 'OK'

    [+] Also, if we notice that requested height is lower than we have - then send own version as a proof

*/
skipProcedurePart1=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    let {session,initiator,requestedSubchain,height,sig} = await BODY(bytes,CONFIG.MAX_PAYLOAD_SIZE)

    let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

    if(await BLS_VERIFY(session+requestedSubchain+height+qtPayload,sig,initiator)){

        let myLocalHealthCheckingHandler = SYMBIOTE_META.HEALTH_MONITORING.get(requestedSubchain)

        if(myLocalHealthCheckingHandler){

            let afkLimit = SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS.SUBCHAIN_AFK_LIMIT*1000

            let currentTime = new Date().getTime()

            if(currentTime-myLocalHealthCheckingHandler.LAST_SEEN >= afkLimit){

                response.end(JSON.stringify({
                    
                    status:'SKIP',
                    
                    sig:await SIG('SKIP_STAGE_1'+session+requestedSubchain+initiator+qtPayload)
                
                }))

            }else if(myLocalHealthCheckingHandler.INDEX>height){

                response.end(JSON.stringify({
                    
                    status:'UPDATE',
                    
                    data:myLocalHealthCheckingHandler
                
                }))

            }else response.end(JSON.stringify({status:'OK'}))
       
        }else response.end('No such subchain')

    }else response.end('Verification failed')

}),




/*

[Info]:

    Route to accept requests from other quorum members about SKIP_PROCEDURE

    But, in stage 2 we get the reference to hostchain where we'll see aggregated proof as result of SKIP_PROCEDURE_STAGE_1


[Accept]:

    {
        subchain:<ID>
        height:<block index of this subchain on which we're going to skip>
        hash:<block hash>
    }

    * Your node will understand that hunting has started because we'll find SKIP_PROCEDURE_STAGE_1 on hostchain


[Response]:

    [+] In case we have found & verified agreement of SKIP_PROCEDURE_STAGE_1 from hostchain, we have this subchainID in appropriate set
        
        1)We should add this subchain to SKIP_PROCEDURE_STAGE_2 set to stop sharing commitments/finalization proofs for this subchain
        2)We generate appropriate signature with the data from CHECKPOINTS manager

        Also, if height/hash/superFinalizationProof in request body is valid and height>our local version - update CHECKPOINTS_MANAGER and generate signature

    [+] In case our local version of height for appropriate subchain > proposed height in request and we have a FINALIZATION_PROOF - send response with status "UPDATE" and our height/hash/finalizationproof

        Soon or late, majority will get the common version of proofs for SKIP_PROCEDURE_STAGE_2 and generate an appropriate aggregated signature

*/
skipProcedurePart2=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    let {subchain,height,hash}=await BODY(bytes,CONFIG.MAX_PAYLOAD_SIZE)

    let checkpointFullID = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

    let subchainCanBeSkipped = SYMBIOTE_META.SKIP_PROCEDURE_STAGE_1.get(checkpointFullID)?.has(subchain)

    if(subchainCanBeSkipped){

        // If we've found proofs about subchain skip procedure - vote to SKIP to perform SKIP_PROCEDURE_STAGE_2
        // We can vote to skip only for height over index that we already send commitment to
        let {INDEX,HASH} = SYMBIOTE_META.CHECKPOINTS_MANAGER.get(subchain)

        // Compare with local version of subchain segment
        if(INDEX>height){

            //Don't vote - send UPDATE response
            response.end(JSON.stringify({
                    
                status:'UPDATE',
                
                data:SYMBIOTE_META.CHECKPOINTS_MANAGER.get(subchain)
            
            }))

        }else if(INDEX===height && hash===HASH){

            //Send signature

            let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+':'+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

            let sig = await SIG(`SKIP_STAGE_2:${subchain}:${INDEX}:${HASH}:${qtPayload}`)

            response.end(JSON.stringify({status:'SKIP_STAGE_2',sig}))

        
        }else response.end(JSON.stringify({status:'NOT FOUND'}))


    }else response.end(JSON.stringify({status:'NOT FOUND'}))


}),




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

We sign the BLAKE3 hash received from JSON'ed proposition of payload for the next checkpoint




[Response]

Response - it's object with the following structure:

{

    ? sig:<BLS signature>

    ? excludeSpecOperations:[]

    ? metadataUpdate:{}

}


[+] If we agree with everything - response with a signature. The <sig> here is SIG(BLAKE3(JSON.stringify(<PROPOSED>)))

{
    sig:<BLS signature>

}

[+] Otherwise, object might be

    [@] If there is no such operation in mempool

    {
        excludeSpecOperations:[<ID1 of operation to exclude>,<ID2 of operation to exclude>,...]   
    }

    [@] If we have proof that for a specific validator we have height with bigger index(longer valid chain)

        We compare the proposition of index:hash for subchain with own version in SYMBIOTE_META.CHECKPOINTS_MANAGER (validatorID => {INDEX,HASH,FINALIZATION_PROOF})

        If we have a bigger index - then we get the FINALIZATION_PROOF from a local storage and send as a part of answer

        {
            metadataUpdate:[

                {
                    subchain:<id of subchain>
                    index:<index of block>,
                    hash:<>,
                    finalizationProof

                },...

            ]
        
        }

    *finalizationProof - contains the aggregated signature SIG(blockID+hash+qtPayload) signed by the current quorum


*/
checkpoint=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    let checkpointProposition=await BODY(bytes,CONFIG.MAX_PAYLOAD_SIZE)


    // [0] Check which operations we don't have locally in mempool - it's signal to exclude it from proposition

    let excludeSpecOperations = checkpointProposition.OPERATIONS.filter(
        
        operation => !SYMBIOTE_META.SPECIAL_OPERATIONS_MEMPOOL.has(operation.id)
        
    ).map(
        
        operation => operation.id
        
    )


    if(excludeSpecOperations.length !== 0){

        response.end(JSON.stringify({excludeSpecOperations}))

    }else{

        // On this step we know that all of proposed operations were checked by us and present in local mempool.

        // [1] Compare proposed VALIDATORS_METADATA with local copy of SYMBIOTE_META.CHECKPOINTS_MANAGER

        let metadataUpdate = []

        Object.keys(checkpointProposition.VALIDATORS_METADATA).forEach(subchain=>{

            let localVersion = SYMBIOTE_META.CHECKPOINTS_MANAGER.get(subchain)

            if(localVersion.INDEX>checkpointProposition.VALIDATORS_METADATA[subchain]){

                // Send the <HEIGHT UPDATE> notification with the FINALIZATION_PROOF

                let template = {
                    
                    subchain,
                    index:localVersion.INDEX,
                    hash:localVersion.HASH,
                    finalizationProof:localVersion.FINALIZATION_PROOF

                }

                metadataUpdate.push(template)

            }

        })

        //___________________________________ SUMMARY - WHAT WE HAVE ON THIS STEP ___________________________________

        /* In metadataUpdate we have objects with the structure
        
            {
                subchain:<id of subchain>
                index:<index of >,
                hash:<>,
                finalizationProof

            }

            If this array is empty - then we can sign the checkpoint proposition(hash of received <checkpointProposition>)
            Otherwise - send metadataUpdate

        */

        if(metadataUpdate.length!==0){

            response.end(JSON.stringify({metadataUpdate}))

        }else{

            let sig = await SIG(BLAKE3(JSON.stringify(checkpointProposition)))

            response.end(JSON.stringify({sig}))

        }

    }

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
    
    type:<SPECIAL_OPERATION id> ===> STAKING_CONTRACT_CALL | SLASH_UNSTAKE | UPDATE_RUBICON , etc. See ../operationsVerifiers.js
    
    payload:{}

}

    * Payload has different structure depending on type

*/

specialOperationsAccept=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    let operation=await BODY(bytes,CONFIG.MAX_PAYLOAD_SIZE)

    //Verify and if OK - put to SPECIAL_OPERATIONS_MEMPOOL
    if(QUORUM_MEMBER_MODE && CONFIG.SYMBIOTE.TRIGGERS.OPERATIONS_ACCEPT && SYMBIOTE_META.SPECIAL_OPERATIONS_MEMPOOL.size<CONFIG.SYMBIOTE.SPECIAL_OPERATIONS_MEMPOOL_SIZE && OPERATIONS_VERIFIERS[operation.type]){

        let isOk = await OPERATIONS_VERIFIERS[operation.type](operation.payload,true,false) //it's just verify without state changes

        if(isOk){

            // Assign the ID to operation to easily detect what we should exclude from checkpoints propositions
            let payloadHash = BLAKE3(JSON.stringify(operation.payload))

            operation.id = payloadHash

            // Add to mempool
            SYMBIOTE_META.SPECIAL_OPERATIONS_MEMPOOL.set(payloadHash,operation)

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

.post('/potential_checkpoint',potentialCheckpoint)

.post('/checkpoint',checkpoint)

.get('/health',healthChecker)


//_______________________________ 2 Routes related to the 2 stages of the skip procedure _______________________________

.post('/skip_procedure_part_1',skipProcedurePart1)

.post('/skip_procedure_part_2',skipProcedurePart2)


.post('/block',acceptBlocks)

.post('/event',acceptEvents)

.post('/addpeer',addPeer)