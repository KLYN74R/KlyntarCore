import{BODY,SAFE_ADD,PARSE_JSON,BLAKE3,GET_GMT_TIMESTAMP} from '../../../KLY_Utils/utils.js'

import {BROADCAST,BLS_VERIFY,BLS_SIG,BLOCKLOG,GET_MAJORITY} from '../utils.js'

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
    
    let total=0
    
    let buffer=Buffer.alloc(0)
    
    let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

    let qtValidatorsMetadata = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.PAYLOAD.SUBCHAINS_METADATA

    let tempObject = SYMBIOTE_META.TEMP.get(qtPayload)


    //Check if we should accept this block.NOTE-use this option only in case if you want to stop accept blocks or override this process via custom runtime scripts or external services
    if(!CONFIG.SYMBIOTE.TRIGGERS.ACCEPT_BLOCKS){
        
        !response.aborted && response.end('Route is off')
        
        return
    
    }


    if(tempObject.PROOFS_REQUESTS.has('NEXT_CHECKPOINT')){

        !response.aborted && response.end('Checkpoint is not fresh')
        
        return

    }

    
    response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async(chunk,last)=>{

        if(total+chunk.byteLength<=CONFIG.MAX_PAYLOAD_SIZE){
        
            buffer=await SAFE_ADD(buffer,chunk,response)//build full data from chunks
    
            total+=chunk.byteLength
        
            if(last){
            
                let block=await PARSE_JSON(buffer)

                let subchainlackOfTotalPowerForCurrentCheckpoint = tempObject.SKIP_PROCEDURE_STAGE_1.has(block.creator) || qtValidatorsMetadata[block.creator].IS_STOPPED
                
                if(subchainlackOfTotalPowerForCurrentCheckpoint){

                    !response.aborted && response.end('Subchain is skipped')
        
                    return                    

                }

                
                let hash=Block.genHash(block)

                let myCommitment = await tempObject.DATABASE.get(block.сreator+":"+block.index).catch(_=>false)
         

                if(myCommitment){

                    !response.aborted && response.end(myCommitment)

                    return
                
                }
                
                
                let checkIfItsChain = block.index===0 || await SYMBIOTE_META.BLOCKS.get(block.creator+":"+(block.index-1)).then(prevBlock=>{

                    //Compare hashes to make sure it's a chain

                    let prevHash = Block.genHash(prevBlock)

                    return prevHash === block.prevHash

                }).catch(_=>false)


                //Otherwise - check if we can accept this block

                let allow=
            
                    typeof block.events==='object' && typeof block.index==='number' && typeof block.prevHash==='string' && typeof block.sig==='string'//make general lightweight overview
                    &&
                    await BLS_VERIFY(hash,block.sig,block.creator)//and finally-the most CPU intensive task
                    &&
                    checkIfItsChain
                


                if(allow){
                
                    let blockID = block.creator+":"+block.index
                    
                    //Store it locally-we'll work with this block later
                    SYMBIOTE_META.BLOCKS.get(blockID).catch(
                            
                        _ =>
                            
                            SYMBIOTE_META.BLOCKS.put(blockID,block).then(()=>{

                                BROADCAST('/block',block)

                                BLOCKLOG(`New \x1b[36m\x1b[41;1mblock\x1b[0m\x1b[32m accepted  \x1b[31m——│`,'S',hash,48,'\x1b[31m',block)

                            }
                            
                        ).catch(_=>{})
                         
                    )
                    

                    let commitment = await BLS_SIG(blockID+hash+qtPayload)

                    //Put to local storage to prevent double voting
                    await tempObject.DATABASE.put(blockID,commitment).then(()=>

                        !response.aborted && response.end(commitment)
                
                    ).catch(_=>!response.aborted && response.end('Something wrong'))


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
    
    Accept aggregated commitments which proofs us that 2/3N+1 has the same block and generate FINALIZATION_PROOF => SIG(blockID+hash+'FINALIZATION'+qtPayload)

[Accept]:

Aggregated version of commitments. This is the proof that 2/3N+1 has received the blockX with hash H and created the commitment(SIG(blockID+hash+qtPayload))


    {
        
        blockID:"7cBETvyWGSvnaVbc7ZhSfRPYXmsTzZzYmraKEgxQMng8UPEEexpvVSgTuo8iza73oP:1337",

        blockHash:"0123456701234567012345670123456701234567012345670123456701234567",
        
        aggregatedPub:"7cBETvyWGSvnaVbc7ZhSfRPYXmsTzZzYmraKEgxQMng8UPEEexpvVSgTuo8iza73oP",

        aggregatedSigna:"kffamjvjEg4CMP8VsxTSfC/Gs3T/MgV1xHSbP5YXJI5eCINasivnw07f/lHmWdJjC4qsSrdxr+J8cItbWgbbqNaM+3W4HROq2ojiAhsNw6yCmSBXl73Yhgb44vl5Q8qD",

        afkValidators:[...]

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

    
    if(CONFIG.SYMBIOTE.TRIGGERS.SHARE_FINALIZATION_PROOF){

        let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

        let tempObject = SYMBIOTE_META.TEMP.get(qtPayload)

        if(tempObject.PROOFS_REQUESTS.has('NEXT_CHECKPOINT')){

            !response.aborted && response.end('Checkpoint is not fresh')
            
    
        }else if(tempObject.PROOFS_RESPONSES.has(aggregatedCommitments.blockID)){

            // Instantly send response
            !response.aborted && response.end(tempObject.PROOFS_RESPONSES.get(aggregatedCommitments.blockID))


        }else{

            let {aggregatedPub,aggregatedSignature,afkValidators} = aggregatedCommitments

            let majorityIsOk = GET_MAJORITY('QUORUM_THREAD') >= SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM.length-afkValidators.length

            let signaIsOk = await bls.singleVerify(aggregatedCommitments.blockID+aggregatedCommitments.blockHash+qtPayload,aggregatedPub,aggregatedSignature).catch(_=>false)
    
            let rootPubIsEqualToReal = bls.aggregatePublicKeys([aggregatedPub,...afkValidators]) === SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB'+qtPayload)
    

            

            if(signaIsOk && majorityIsOk && rootPubIsEqualToReal){

                // Add request to sync function 
                tempObject.PROOFS_REQUESTS.set(aggregatedCommitments.blockID,{hash:aggregatedCommitments.blockHash,finalizationProof:{aggregatedPub,aggregatedSignature,afkValidators}})
    
                !response.aborted && response.end('OK')
                
            }else !response.aborted && response.end('Something wrong')    

        }

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

    let rootPubIsEqualToReal = bls.aggregatePublicKeys([possibleSuperFinalizationProof.aggregatedPub,...possibleSuperFinalizationProof.afkValidators]) === SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB'+qtPayload)

    let checkpointTempDB = SYMBIOTE_META.TEMP.get(qtPayload).DATABASE



    if(signaIsOk && majorityIsOk && rootPubIsEqualToReal){

        checkpointTempDB.put('SFP:'+possibleSuperFinalizationProof.blockID+possibleSuperFinalizationProof.blockHash,possibleSuperFinalizationProof)

        !response.aborted && response.end('OK')

    }else !response.aborted && response.end('Something wrong')


}),




/*

To return SUPER_FINALIZATION_PROOF related to some block PubX:Index

Only in case when we have SUPER_FINALIZATION_PROOF we can verify block with the 100% garantee that it's the part of valid subchain and will be included to checkpoint 

Params:

    [0] - blockID+blockHash

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

        let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID
       
        let checkpointTempDB = SYMBIOTE_META.TEMP.get(qtPayload).DATABASE
    
        let superFinalizationProof = await checkpointTempDB.get('SFP:'+request.getParameter(0)).catch(_=>false)


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

        if(!appropriateDescriptor) response.end(JSON.stringify({err:`Still haven't start the procedure of grabbing finalization proofs`}))


        
        let latestFullyFinalizedHeight = appropriateDescriptor.height-1

        let block = await SYMBIOTE_META.BLOCKS.get(CONFIG.SYMBIOTE.PUB+":"+latestFullyFinalizedHeight).catch(_=>false)

        let latestHash = block && Block.genHash(block)

        let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID
       
        let checkpointTempDB = SYMBIOTE_META.TEMP.get(qtPayload).DATABASE

        let superFinalizationProof = await checkpointTempDB.get('SFP:'+CONFIG.SYMBIOTE.PUB+":"+latestFullyFinalizedHeight+latestHash).catch(_=>false)



        if(superFinalizationProof){

            let healthProof = {latestFullyFinalizedHeight,latestHash,superFinalizationProof}

            response.end(JSON.stringify(healthProof))

        }else response.end(JSON.stringify({err:'No proof'}))

    }else response.end(JSON.stringify({err:'Route is off'}))

},




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
skipProcedureStage1=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    let {session,initiator,requestedSubchain,height,sig} = await BODY(bytes,CONFIG.MAX_PAYLOAD_SIZE)

    let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

    let tempObject = SYMBIOTE_META.TEMP.get(qtPayload)

    if(tempObject.PROOFS_REQUESTS.has('NEXT_CHECKPOINT')){

        !response.aborted && response.end('Checkpoint is not fresh')
        
        return

    }

    if(await BLS_VERIFY(session+requestedSubchain+height+qtPayload,sig,initiator)){

        let myLocalHealthCheckingHandler = tempObject.HEALTH_MONITORING.get(requestedSubchain)

        if(myLocalHealthCheckingHandler){

            let afkLimit = SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS.SUBCHAIN_AFK_LIMIT

            let currentTime = GET_GMT_TIMESTAMP()

            if(currentTime-myLocalHealthCheckingHandler.LAST_SEEN >= afkLimit){

                response.end(JSON.stringify({
                    
                    status:'SKIP',
                    
                    sig:await BLS_SIG('SKIP_STAGE_1'+session+requestedSubchain+initiator+qtPayload)
                
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
        finalizationProof
    }

    * Your node will understand that hunting has started because we'll find SKIP_PROCEDURE_STAGE_1 on hostchain


[Response]:

    [+] In case we have found & verified agreement of SKIP_PROCEDURE_STAGE_1 from hostchain, we have this subchainID in appropriate set
        
        1)We should add this subchain to SKIP_PROCEDURE_STAGE_2 set to stop sharing commitments/finalization proofs for this subchain
        2)We generate appropriate signature with the data from CHECKPOINTS manager

        Also, if height/hash/superFinalizationProof in request body is valid and height>our local version - update CHECKPOINT_MANAGER and generate signature

    [+] In case our local version of height for appropriate subchain > proposed height in request and we have a FINALIZATION_PROOF - send response with status "UPDATE" and our height/hash/finalizationproof

        Soon or late, majority will get the common version of proofs for SKIP_PROCEDURE_STAGE_2 and generate an appropriate aggregated signature

*/
skipProcedureStage2=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    let {subchain,height,hash,finalizationProof}=await BODY(bytes,CONFIG.MAX_PAYLOAD_SIZE)

    let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

    let tempObject = SYMBIOTE_META.TEMP.get(qtPayload)

    let reverseThreshold = SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS.QUORUM_SIZE-GET_MAJORITY('QUORUM_THREAD')

    let qtRootPub = SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB'+qtPayload) 

    let localSyncHandler = tempObject.CHECKPOINT_MANAGER_SYNC_HELPER.get(subchain)



    if(tempObject.PROOFS_REQUESTS.has('NEXT_CHECKPOINT')){

        !response.aborted && response.end('Checkpoint is not fresh')
    
    }else if(tempObject.SKIP_PROCEDURE_STAGE_1.has(subchain)){

        // If we've found proofs about subchain skip procedure - vote to SKIP to perform SKIP_PROCEDURE_STAGE_2
        // We can vote to skip only for height over index that we already send commitment to
        let {INDEX,HASH} = tempObject.CHECKPOINT_MANAGER.get(subchain)

        let sigResponse = tempObject.PROOFS_RESPONSES.get('SKIP_STAGE_2:'+subchain)

        //Check if we has a signature response
        
        if(sigResponse){

            response.end(JSON.stringify({status:'SKIP_STAGE_2',sig:sigResponse}))

            return
        }

        // Compare with local version of subchain segment
        if(INDEX>height){

            //Don't vote - send UPDATE response
            response.end(JSON.stringify({
                    
                status:'UPDATE',
                
                data:tempObject.CHECKPOINT_MANAGER.get(subchain) //data is {INDEX,HASH,FINALIZATION_PROOF}
            
            }))

        }else if(INDEX===height && hash===HASH){

            // Add to PROOFS_REQUESTS
            tempObject.PROOFS_REQUESTS.set('SKIP_STAGE_2:'+subchain,{SUBCHAIN:subchain,INDEX,HASH})

            response.end(JSON.stringify({status:'OK'}))

        
        }else if(localSyncHandler.INDEX<height){

            //Verify finalization proof and update the value

            let {aggregatedPub,aggregatedSignature,afkValidators} = finalizationProof

            let data = subchain+':'+height+hash+qtPayload

            let finalizationProofIsOk = await bls.verifyThresholdSignature(aggregatedPub,afkValidators,qtRootPub,data,aggregatedSignature,reverseThreshold).catch(_=>false)

            if(finalizationProofIsOk){

                localSyncHandler.INDEX = height

                localSyncHandler.HASH = hash

                localSyncHandler.FINALIZATION_PROOF = finalizationProof

            }

            response.end(JSON.stringify({status:'LOCAL_UPDATE'}))

        }else response.end(JSON.stringify({status:'NOT FOUND'}))


    }else response.end(JSON.stringify({status:'NOT FOUND'}))


}),




/*

[Info]:

    Route to accept requests from other quorum members about SKIP_PROCEDURE

    But, in stage 3 we get the proof that 2/3N+1 from quorum is ready to stop the subchain from height H with hash <HASH>


[Accept]:

    {
        subchain:<ID> - the subchain for which we've found proofs for SKIP_PROCEDURE_STAGE_2 on hostchain to stop from height H with hash <HASH>
    }


[Response]:

    [+] In case we have found & verified agreement of SKIP_PROCEDURE_STAGE_2 from hostchain, we have this subchainID in appropriate mapping(SYMBIOTE_META.SKIP_PROCEDURE_STAGE_2)
        Then,response with SIG(`SKIP_STAGE_3:${subchain}:${handler.INDEX}:${handler.HASH}:${qtPayload}`)

    [+] Otherwise - send NOT_FOUND status


*/
skipProcedureStage3=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    let {subchain}=await BODY(bytes,CONFIG.MAX_PAYLOAD_SIZE)
    
    let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

    let tempObject = SYMBIOTE_META.TEMP.get(qtPayload)

    let skipProof = tempObject.PROOFS_RESPONSES.get(`SKIP_STAGE_3:${subchain}`)

    if(skipProof){

        // If we've found proofs about subchain skip procedure stage 2(so we know the height/hash)- vote to SKIP to perform SKIP_PROCEDURE_STAGE_3

        response.end(JSON.stringify({status:'SKIP_STAGE_3',sig:skipProof}))
        
    }else response.end(JSON.stringify({status:'NOT FOUND'}))


}),




/*

Accept checkpoints from other validators in quorum and returns own version as answer
! Check the trigger START_SHARING_CHECKPOINT

[Accept]:


{
    
    ISSUER:<BLS pubkey of checkpoint grabbing initiator>,

    PREV_CHECKPOINT_PAYLOAD_HASH: SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH,
    
    SUBCHAINS_METADATA: {
                
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

        We compare the proposition of index:hash for subchain with own version in SYMBIOTE_META.CHECKPOINT_MANAGER (validatorID => {INDEX,HASH,FINALIZATION_PROOF})

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
checkpointStage1Handler=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    let checkpointProposition=await BODY(bytes,CONFIG.MAX_PAYLOAD_SIZE)

    let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

    let currentPoolsMetadata = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.PAYLOAD.SUBCHAINS_METADATA

    let tempObject = SYMBIOTE_META.TEMP.get(qtPayload)

    let specialOperationsMempool = tempObject.SPECIAL_OPERATIONS_MEMPOOL
    

    if(!tempObject.PROOFS_RESPONSES.has('READY_FOR_CHECKPOINT')){

        response.end(JSON.stringify({error:'This checkpoint is fresh or invalid'}))

        return

    }
    

    // Create copy to delete from
    let subchainsToSkipThatCantBeExcluded = new Set(tempObject.SKIP_PROCEDURE_STAGE_2.keys())

    // [0] Check which operations we don't have locally in mempool - it's signal to exclude it from proposition
    
    let excludeSpecOperations = checkpointProposition.OPERATIONS.filter(
        
        operation => {

            if(specialOperationsMempool.has(operation.id)){

                // If operation exists - check if it's STOP_VALIDATOR operation. Mark it if it's <SKIP> operation(i.e. stop=true)
                if(operation.type==='STOP_VALIDATOR' && operation.payload.stop === true) {

                    subchainsToSkipThatCantBeExcluded.delete(operation.payload.subchain)
                }

                return false

            }else return true // Exclude operations which we don't have
        
        }
        
    ).map(operation => operation.id)



    
    if(excludeSpecOperations.length !== 0){

        response.end(JSON.stringify({excludeSpecOperations}))

    }else if (subchainsToSkipThatCantBeExcluded.size===0){

        // On this step we know that all of proposed operations were checked by us and present in local mempool.
        // Also, we know that all the mandatory STOP_VALIDATOR operations are in current version of payload


        
        // [1] Compare proposed SUBCHAINS_METADATA with local copy of SYMBIOTE_META.CHECKPOINT_MANAGER

        let metadataUpdate = [], wrongSkipStatusPresent=false

        let subchains = Object.keys(checkpointProposition.SUBCHAINS_METADATA)


        for(let subchain of subchains){

            let localVersion = tempObject.CHECKPOINT_MANAGER.get(subchain)

            if(checkpointProposition.SUBCHAINS_METADATA[subchain].IS_STOPPED !== currentPoolsMetadata[subchain].IS_STOPPED) {

                wrongSkipStatusPresent=true

                break

            }

            if(localVersion.INDEX > checkpointProposition.SUBCHAINS_METADATA[subchain].INDEX){

                // Send the <HEIGHT UPDATE> notification with the FINALIZATION_PROOF

                let template = {
                    
                    subchain,
                    index:localVersion.INDEX,
                    hash:localVersion.HASH,
                    finalizationProof:localVersion.FINALIZATION_PROOF

                }

                metadataUpdate.push(template)

            }

        }


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

        if(wrongSkipStatusPresent){

            response.end(JSON.stringify({error:'Wrong <IS_STOPPED> status for subchain'}))

        }
        else if(metadataUpdate.length!==0){

            response.end(JSON.stringify({metadataUpdate}))

        }else if(checkpointProposition.PREV_CHECKPOINT_PAYLOAD_HASH === SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH){

            let sig = await BLS_SIG(BLAKE3(JSON.stringify(checkpointProposition)))

            response.end(JSON.stringify({sig}))

        }else response.end(JSON.stringify({error:'Everything failed'}))

    }

}),




/*

[Description]:

    Route for the second stage of checkpoint distribution

    [0] Here we accept the checkpoint's payload and a proof that majority has the same. Also, ISSUER_PROOF is a BLS signature of proposer of this checkpoint. We need this signature to prevent spam

    [1] If payload with appropriate hash is already in our local db - then re-sign the same hash 

    [2] If no, after verification this signature, we store this payload by its hash (<PAYLOAD_HASH> => <PAYLOAD>) to SYMBIOTE_META.TEMP[<QT_PAYLOAD>]

    [3] After we store it - generate the signature SIG('STAGE_2'+PAYLOAD_HASH) and response with it

    This way, we prevent the spam and make sure that at least 2/3N+1 has stored the same payload related to appropriate checkpoint's header



[Accept]:


{
    CHECKPOINT_FINALIZATION_PROOF:{

        aggregatedPub:<2/3N+1 from QUORUM>,
        aggregatedSigna:<SIG(PAYLOAD_HASH)>,
        afkValidators:[]

    }

    ISSUER_PROOF:SIG(ISSUER+PAYLOAD_HASH)

    CHECKPOINT_PAYLOAD:{

        ISSUER:<BLS pubkey of checkpoint grabbing initiator>
            
        PREV_CHECKPOINT_PAYLOAD_HASH: SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH,
            
        SUBCHAINS_METADATA: {
                
            '7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta': {INDEX,HASH,IS_STOPPED}

            /..other data
            
        },
        OPERATIONS: GET_SPEC_EVENTS(),
        OTHER_SYMBIOTES: {}
        
    }


}

To verify it => VERIFY(aggPub,aggSigna,afkValidators,data), where data - BLAKE3(JSON.stringify(<PROPOSED PAYLOAD>))

To sign it => SIG('STAGE_2'+BLAKE3(JSON.stringify(<PROPOSED>)))

We sign the BLAKE3 hash received from JSON'ed proposition of payload for the next checkpoint


[Response]

Response - it's object with the following structure:

{

    ? sig:<BLS signature>

    ? error:'Something gets wrong'

}

*/
checkpointStage2Handler=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

    let checkpointProofsResponses = SYMBIOTE_META.TEMP.get(qtPayload).PROOFS_RESPONSES


    if(!checkpointProofsResponses.has('READY_FOR_CHECKPOINT')){

        response.end(JSON.stringify({error:'This checkpoint is fresh or invalid'}))

        return

    }


    let {CHECKPOINT_FINALIZATION_PROOF,CHECKPOINT_PAYLOAD,ISSUER_PROOF}=await BODY(bytes,CONFIG.MAX_PAYLOAD_SIZE)

    let {aggregatedPub,aggregatedSignature,afkValidators} = CHECKPOINT_FINALIZATION_PROOF

    
    let payloadHash = BLAKE3(JSON.stringify(CHECKPOINT_PAYLOAD))

    let checkpointTemporaryDB = SYMBIOTE_META.TEMP.get(qtPayload).DATABASE



    let payloadIsAlreadyInDb = await checkpointTemporaryDB.get(payloadHash).catch(_=>false)

    let proposerAlreadyInDB = await checkpointTemporaryDB.get('PROPOSER_'+CHECKPOINT_PAYLOAD.ISSUER).catch(_=>false)



    if(payloadIsAlreadyInDb){

        let sig = await BLS_SIG('STAGE_2'+payloadHash)

        response.end(JSON.stringify({sig}))

    }else if(proposerAlreadyInDB){

        response.end(JSON.stringify({error:`You've already sent a majority agreed payload for checkpoint`}))

    }
    else{

        let reverseThreshold = SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS.QUORUM_SIZE-GET_MAJORITY('QUORUM_THREAD')

        //Verify 2 signatures

        let majorityHasSignedIt = await bls.verifyThresholdSignature(aggregatedPub,afkValidators,SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB'+qtPayload),payloadHash,aggregatedSignature,reverseThreshold).catch(_=>false)

        let issuerSignatureIsOk = await bls.singleVerify(CHECKPOINT_PAYLOAD.ISSUER+payloadHash,CHECKPOINT_PAYLOAD.ISSUER,ISSUER_PROOF)



        if(majorityHasSignedIt && issuerSignatureIsOk){

            // Store locally, mark that this issuer has already sent us a finalized version of checkpoint
            let atomicBatch = checkpointTemporaryDB.batch()

            atomicBatch.put('PROPOSER_'+CHECKPOINT_PAYLOAD.ISSUER,true)
            
            atomicBatch.put(payloadHash,CHECKPOINT_PAYLOAD)

            await atomicBatch.write()

            // Generate the signature for the second stage

            let sig = await BLS_SIG('STAGE_2'+payloadHash)

            response.end(JSON.stringify({sig}))

        }else response.end(JSON.stringify({error:'Something wrong'}))

    }

}),




/*

To return payload of some checkpoint by it's hash

Params:

    [0] - payloadHash


Returns:

    {
        PREV_CHECKPOINT_PAYLOAD_HASH: '',
        SUBCHAINS_METADATA: [Object],
        OPERATIONS: [],
        OTHER_SYMBIOTES: {}
    }

*/
getPayloadForCheckpoint=async(response,request)=>{

    response.onAborted(()=>response.aborted=true)

    if(CONFIG.SYMBIOTE.TRIGGERS.GET_PAYLOAD_FOR_CHECKPOINT){

        let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

        let checkpointTemporaryDB = SYMBIOTE_META.TEMP.get(qtPayload).DATABASE


        let payloadHash = request.getParameter(0),

            checkpoint = await checkpointTemporaryDB.get(payloadHash).catch(_=>false) || await SYMBIOTE_META.CHECKPOINTS.get(payloadHash).then(headerAndPayload=>headerAndPayload.PAYLOAD).catch(_=>false)

        if(checkpoint){

            response.end(JSON.stringify(checkpoint))

        }else response.end('No checkpoint')

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

    let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

    let specialOperationsMempool = SYMBIOTE_META.TEMP.get(qtPayload).SPECIAL_OPERATIONS_MEMPOOL


    //Verify and if OK - put to SPECIAL_OPERATIONS_MEMPOOL
    if(CONFIG.SYMBIOTE.TRIGGERS.ACCEPT_SPECIAL_OPERATIONS && specialOperationsMempool.size<CONFIG.SYMBIOTE.SPECIAL_OPERATIONS_MEMPOOL_SIZE && OPERATIONS_VERIFIERS[operation.type]){

        let isOk = await OPERATIONS_VERIFIERS[operation.type](operation.payload,true,false) //it's just verify without state changes

        if(isOk){        

            // Assign the ID to operation to easily detect what we should exclude from checkpoints propositions
            let payloadHash = BLAKE3(JSON.stringify(operation.payload))

            operation.id = payloadHash

            // Add to mempool
            specialOperationsMempool.set(payloadHash,operation)

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

.get('/get_super_finalization/:BLOCK_ID_AND_HASH',getSuperFinalization)


.get('/get_payload_for_checkpoint/:PAYLOAD_HASH',getPayloadForCheckpoint)

.post('/special_operations',specialOperationsAccept)


// To sign the checkpoints' payloads
.post('/checkpoint_stage_1',checkpointStage1Handler)

// To confirm the checkpoints' payloads. Only after grabbing this signatures we can publish it to hostchain
.post('/checkpoint_stage_2',checkpointStage2Handler)


.get('/health',healthChecker)


//_______________________________ 3 Routes related to the 3 stages of the skip procedure _______________________________

.post('/skip_procedure_stage_1',skipProcedureStage1)

.post('/skip_procedure_stage_2',skipProcedureStage2)

.post('/skip_procedure_stage_3',skipProcedureStage3)


.post('/block',acceptBlocks)

.post('/event',acceptEvents)

.post('/addpeer',addPeer)