import{BODY,SAFE_ADD,PARSE_JSON,BLAKE3,GET_GMT_TIMESTAMP} from '../../../KLY_Utils/utils.js'

import {BLS_VERIFY,BLS_SIGN_DATA,BLOCKLOG,GET_MAJORITY,USE_TEMPORARY_DB} from '../utils.js'

import bls from '../../../KLY_Utils/signatures/multisig/bls.js'

import OPERATIONS_VERIFIERS from '../operationsVerifiers.js'

import Block from '../essences/block.js'




let BLS_PUBKEY_FOR_FILTER = CONFIG.SYMBIOTE.FILTER_PUB || CONFIG.SYMBIOTE.PUB,




//__________________________________________________________BASIC FUNCTIONAL_____________________________________________________________________



/*

[Description]:
    Accept blocks and return commitment if subchain sequence completed
  
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

    let qtSubchainMetadata = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.PAYLOAD.POOLS_METADATA

    let tempObject = SYMBIOTE_META.TEMP.get(qtPayload)


    //Check if we should accept this block.NOTE-use this option only in case if you want to stop accept blocks or override this process via custom runtime scripts or external services
    if(!CONFIG.SYMBIOTE.TRIGGERS.ACCEPT_BLOCKS){
        
        !response.aborted && response.end('Route is off')
        
        return
    
    }

    if(!SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.COMPLETED || !tempObject){

        !response.aborted && response.end('QT checkpoint is incomplete')

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
            
                let block = await PARSE_JSON(buffer)

                let subchainIsSkipped = tempObject.SKIP_PROCEDURE_STAGE_1.has(block.creator) || qtSubchainMetadata[block.creator]?.IS_STOPPED
            

                if(subchainIsSkipped){

                    !response.aborted && response.end('Work on subchain was skipped')
        
                    return

                }

                let mainPoolOrAtLeastReassignment = qtSubchainMetadata[block.creator]
                
                                                    &&
                                                    
                                                    (tempObject.REASSIGNMENTS.has(block.creator) && qtSubchainMetadata[block.creator].IS_RESERVE || !qtSubchainMetadata[block.creator].IS_RESERVE)


                if(!mainPoolOrAtLeastReassignment){

                    !response.aborted && response.end(`This block creator can't produce blocks`)
        
                    return

                }
                


                let hash=Block.genHash(block)


                let myCommitment = await USE_TEMPORARY_DB('get',tempObject.DATABASE,block.creator+":"+block.index).catch(_=>false)
                
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
            
                    typeof block.index==='number' && typeof block.prevHash==='string' && typeof block.sig==='string' && Array.isArray(block.events)//make general lightweight overview
                    &&
                    await BLS_VERIFY(hash,block.sig,block.creator).catch(_=>false)//and finally-the most CPU intensive task
                    &&
                    checkIfItsChain
                

                if(allow){
                
                    let blockID = block.creator+":"+block.index
                    
                    //Store it locally-we'll work with this block later
                    SYMBIOTE_META.BLOCKS.get(blockID).catch(
                            
                        _ =>
                            
                            SYMBIOTE_META.BLOCKS.put(blockID,block).then(()=>

                                BLOCKLOG(`New \x1b[36m\x1b[41;1mblock\x1b[0m\x1b[32m accepted  \x1b[31m—│`,'S',hash,48,'\x1b[31m',block)

                            
                        ).catch(_=>{})
                         
                    )
                    

                    let commitment = await BLS_SIGN_DATA(blockID+hash+qtPayload)
                

                    //Put to local storage to prevent double voting
                    await USE_TEMPORARY_DB('put',tempObject.DATABASE,blockID,commitment).then(()=>
    
                        !response.aborted && response.end(commitment)
                    
                    ).catch(error=>!response.aborted && response.end(`Something wrong => ${JSON.stringify(error)}`))


                }else !response.aborted && response.end('Overview failed. Make sure input data is ok')
            
            }
        
        }else !response.aborted && response.end('Payload limit')
    
    })

},




/*

[Description]:
    Accept many blocks and return commitment if subchain sequence completed
  
[Accept]:

    Blocks array

    [

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

    ]
  

[Response]:

    SIG(blockID+hash) => jXO7fLynU9nvN6Hok8r9lVXdFmjF5eye09t+aQsu+C/wyTWtqwHhPwHq/Nl0AgXDDbqDfhVmeJRKV85oSEDrMjVJFWxXVIQbNBhA7AZjQNn7UmTI75WAYNeQiyv4+R4S

    <OR> nothing

*/
acceptManyBlocks=response=>{
    
    let total=0
    
    let buffer=Buffer.alloc(0)
    
    let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

    let tempObject = SYMBIOTE_META.TEMP.get(qtPayload)


    //Check if we should accept this block.NOTE-use this option only in case if you want to stop accept blocks or override this process via custom runtime scripts or external services
    if(!CONFIG.SYMBIOTE.TRIGGERS.ACCEPT_BLOCKS){
        
        !response.aborted && response.end('Route is off')
        
        return
    
    }

    if(!SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.COMPLETED || !tempObject){

        !response.aborted && response.end('QT checkpoint is incomplete')

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
            
                
                let blocksBatch=await PARSE_JSON(buffer)

                let commitmentsMap={}


                for(let block of blocksBatch){

                    let blockID = block.creator+":"+block.index

                    let subchainIsSkipped = tempObject.SKIP_PROCEDURE_STAGE_1.has(block.creator) || SYMBIOTE_META.VERIFICATION_THREAD.POOLS_METADATA[block.creator]?.IS_STOPPED
                
                    if(subchainIsSkipped) continue
   
                    
                    let hash=Block.genHash(block)
    
    
                    let myCommitment = await USE_TEMPORARY_DB('get',tempObject.DATABASE,blockID).catch(_=>false)
             
    
                    if(myCommitment){

                        commitmentsMap[blockID]=myCommitment
    
                        continue
                    
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
                        await BLS_VERIFY(hash,block.sig,block.creator).catch(_=>false)//and finally-the most CPU intensive task
                        &&
                        checkIfItsChain
                    
    
    
                    if(allow){
  
                        
                        //Store it locally-we'll work with this block later
                        await SYMBIOTE_META.BLOCKS.get(blockID).catch(
                                
                            _ =>
                                
                                SYMBIOTE_META.BLOCKS.put(blockID,block).then(()=>
    
                                    BLOCKLOG(`New \x1b[36m\x1b[41;1mblock\x1b[0m\x1b[32m accepted  \x1b[31m—│`,'S',hash,48,'\x1b[31m',block)
                                
                            ).catch(_=>{})
                             
                        )
                        
                        
                        let commitment = await BLS_SIGN_DATA(blockID+hash+qtPayload)
                    
    
                        //Put to local storage to prevent double voting
                        await USE_TEMPORARY_DB('put',tempObject.DATABASE,blockID,commitment).then(()=>
        
                            commitmentsMap[blockID]=commitment
                        
                        ).catch(_=>{})
    
    
                    }

                    
                }

                !response.aborted && response.end(JSON.stringify(commitmentsMap))  
            
            }
        
        }else !response.aborted && response.end('Payload limit')
    
    })

},




//Format of body : {symbiote,body}
//There is no <creator> field-we get it from tx
acceptEvents=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    let {symbiote,event}=await BODY(bytes,CONFIG.MAX_PAYLOAD_SIZE)
    
    //Reject all txs if route is off and other guards methods

    /*
    
        ...and do such "lightweight" verification here to prevent db bloating
        Anyway we can bump with some short-term desynchronization while perform operations over block
        Verify and normalize object
        Fetch values about fees and MC from some decentralized sources
    
        The second operand tells us:if buffer is full-it makes whole logical expression FALSE
        Also check if we have normalizer for this type of event

    
    */

    if(typeof event?.creator!=='string' || typeof event.nonce!=='number' || typeof event.sig!=='string'){

        !response.aborted && response.end('Event structure is wrong')

        return
    }

    if(CONFIG.SYMBIOTE.SYMBIOTE_ID!==symbiote){

        !response.aborted && response.end(`Wrong symbiote ID => My:${CONFIG.SYMBIOTE.SYMBIOTE_ID} | Your:${symbiote}`)

        return

    }

    if(!CONFIG.SYMBIOTE.TRIGGERS.ACCEPT_EVENTS){
        
        !response.aborted && response.end('Route is off')
        
        return
        
    }

    if(!SYMBIOTE_META.FILTERS[event.type]){

        !response.aborted && response.end('No such filter. Make sure your <event.type> is supported by current version of workflow runned on symbiote')
        
        return

    }

    
    if(SYMBIOTE_META.MEMPOOL.length<CONFIG.SYMBIOTE.EVENTS_MEMPOOL_SIZE){

        let filteredEvent=await SYMBIOTE_META.FILTERS[event.type](event,BLS_PUBKEY_FOR_FILTER)

        if(filteredEvent){

            !response.aborted && response.end('OK')

            SYMBIOTE_META.MEMPOOL.push(filteredEvent)
                        
        }else !response.aborted && response.end(`Can't get filtered value of event`)

    }else !response.aborted && response.end('Mempool is fullfilled')

}),




FINALIZATION_PROOFS_POLLING=(tempObject,blockID,response)=>{


    if(tempObject.PROOFS_RESPONSES.has(blockID)){

        // Instantly send response
        !response.aborted && response.end(tempObject.PROOFS_RESPONSES.get(blockID))

    }else{

        //Wait a while

        setTimeout(()=>FINALIZATION_PROOFS_POLLING(tempObject,blockID,response),0)

    }


},


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

        afkVoters:[...]

    }


___________________________Verification steps___________________________


[+] Verify the signa

[+] Make sure that at least 2/3N+1 is inside aggregated key/signa. Use afkVoters array for this and QUORUM_THREAD.QUORUM

[+] RootPub is equal to QUORUM_THREAD rootpub



[Response]:

    If everything is OK - response with signa SIG(blockID+hash+'FINALIZATION'+QT.CHECKPOINT.HEADER.PAYLOAD_HASH+QT.CHECKPOINT.HEADER.ID)

    
*/
finalization=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    let aggregatedCommitments=await BODY(bytes,CONFIG.PAYLOAD_SIZE)

    if(CONFIG.SYMBIOTE.TRIGGERS.SHARE_FINALIZATION_PROOF && SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.COMPLETED){


        let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

        if(!SYMBIOTE_META.TEMP.has(qtPayload)){

            !response.aborted && response.end('QT checkpoint is incomplete')

            return
        }

        
        let tempObject = SYMBIOTE_META.TEMP.get(qtPayload)

        let qtSubchainMetadata = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.PAYLOAD.POOLS_METADATA 


        if(tempObject.PROOFS_REQUESTS.has('NEXT_CHECKPOINT')){

            !response.aborted && response.end('Checkpoint is not fresh')
            
    
        }else if(tempObject.PROOFS_RESPONSES.has(aggregatedCommitments.blockID)){

            // Instantly send response
            !response.aborted && response.end(tempObject.PROOFS_RESPONSES.get(aggregatedCommitments.blockID))


        }else{

            
            let {blockID,blockHash,aggregatedPub,aggregatedSignature,afkVoters} = aggregatedCommitments

            if(typeof aggregatedPub !== 'string' || typeof aggregatedSignature !== 'string' || typeof blockID !== 'string' || typeof blockHash !== 'string' || !Array.isArray(afkVoters)){

                !response.aborted && response.end('Wrong format of input params')

                return

            }

            let [blockCreator,_] = blockID.split(':')


            let majorityIsOk =  (SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM.length-afkVoters.length) >= GET_MAJORITY('QUORUM_THREAD')

            let signaIsOk = await bls.singleVerify(blockID+blockHash+qtPayload,aggregatedPub,aggregatedSignature).catch(_=>false)
    
            let rootPubIsEqualToReal = bls.aggregatePublicKeys([aggregatedPub,...afkVoters]) === SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB'+qtPayload)
    
            let mainPoolOrAtLeastReassignment = qtSubchainMetadata[blockCreator] && (tempObject.REASSIGNMENTS.has(blockCreator) && qtSubchainMetadata[blockCreator].IS_RESERVE || !qtSubchainMetadata[blockCreator].IS_RESERVE)
            
            
            if(signaIsOk && majorityIsOk && rootPubIsEqualToReal && mainPoolOrAtLeastReassignment){

                // Add request to sync function 
                tempObject.PROOFS_REQUESTS.set(blockID,{hash:blockHash,finalizationProof:{aggregatedPub,aggregatedSignature,afkVoters}})
    
                FINALIZATION_PROOFS_POLLING(tempObject,blockID,response)
                
            }else !response.aborted && response.end(`Something wrong because all of 4 must be true => signa_is_ok:${signaIsOk} | majority_voted_for_it:${majorityIsOk} | quorum_root_pubkey_is_current:${rootPubIsEqualToReal} | mainPoolOrAtLeastReassignment:${mainPoolOrAtLeastReassignment}`)

        }

    }else !response.aborted && response.end('Route is off or QT checkpoint is incomplete')

}),




MANY_FINALIZATION_PROOFS_POLLING=(tempObject,blocksSet,response)=>{

    if(blocksSet.every(blockID=>tempObject.PROOFS_RESPONSES.has(blockID))){

        let fpArray=blocksSet.map(blockID=>{

            let fp = tempObject.PROOFS_RESPONSES.get(blockID)

            tempObject.PROOFS_RESPONSES.delete(blockID)

            return fp

        })


        // Instantly send response
        !response.aborted && response.end(JSON.stringify(fpArray))

    }else{

        //Wait a while

        setTimeout(()=>MANY_FINALIZATION_PROOFS_POLLING(tempObject,blocksSet,response),0)

    }


},




manyFinalization=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    let aggregatedCommitmentsArray=await BODY(bytes,CONFIG.MAX_PAYLOAD_SIZE)

    let blocksSet = []

    if(CONFIG.SYMBIOTE.TRIGGERS.SHARE_FINALIZATION_PROOF && SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.COMPLETED){


        let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

        if(!SYMBIOTE_META.TEMP.has(qtPayload)){

            !response.aborted && response.end('QT checkpoint is incomplete')

            return
        }

        let tempObject = SYMBIOTE_META.TEMP.get(qtPayload)

        if(tempObject.PROOFS_REQUESTS.has('NEXT_CHECKPOINT')){

            !response.aborted && response.end('Checkpoint is not fresh')
            
    
        }
        
        
        for(let aggragatedCommitment of aggregatedCommitmentsArray){

            let {blockID,blockHash,aggregatedPub,aggregatedSignature,afkVoters} = aggragatedCommitment
    

            if(typeof aggregatedPub !== 'string' || typeof aggregatedSignature !== 'string' || typeof blockID !== 'string' || typeof blockHash !== 'string' || !Array.isArray(afkVoters)){

                !response.aborted && response.end('Wrong format of input params')

                return

            }

            let majorityIsOk =  (SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM.length-afkVoters.length) >= GET_MAJORITY('QUORUM_THREAD')

            let signaIsOk = await bls.singleVerify(blockID+blockHash+qtPayload,aggregatedPub,aggregatedSignature).catch(_=>false)
    
            let rootPubIsEqualToReal = bls.aggregatePublicKeys([aggregatedPub,...afkVoters]) === SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB'+qtPayload)
    
            
            
            
            if(signaIsOk && majorityIsOk && rootPubIsEqualToReal){

                // Add request to sync function 
                tempObject.PROOFS_REQUESTS.set(blockID,{hash:blockHash,finalizationProof:{aggregatedPub,aggregatedSignature,afkVoters}})
    
                blocksSet.push(blockID)

            }

        }


        MANY_FINALIZATION_PROOFS_POLLING(tempObject,blocksSet,response)
        

    }else !response.aborted && response.end('Route is off or QT checkpoint is incomplete')

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

    let qtSubchainMetadata = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.PAYLOAD.POOLS_METADATA

    let tempObject = SYMBIOTE_META.TEMP.get(qtPayload)

    if(!tempObject){

        !response.aborted && response.end('Checkpoint is not fresh')

        return
    }

    
   
    let possibleSuperFinalizationProof=await BODY(bytes,CONFIG.PAYLOAD_SIZE)

    let {blockID,blockHash,aggregatedPub,aggregatedSignature,afkVoters} = possibleSuperFinalizationProof
    
    if(typeof aggregatedPub !== 'string' || typeof aggregatedSignature !== 'string' || typeof blockID !== 'string' || typeof blockHash !== 'string' || !Array.isArray(afkVoters)){

        !response.aborted && response.end('Wrong format of input params')

        return

    }

    let myLocalBlock = await SYMBIOTE_META.BLOCKS.get(blockID).catch(_=>false)

    let [blockCreator,_] = blockID.split(':')


    let hashesAreEqual = myLocalBlock ? Block.genHash(myLocalBlock) === blockHash : false

    let signaIsOk = await bls.singleVerify(blockID+blockHash+'FINALIZATION'+qtPayload,aggregatedPub,aggregatedSignature).catch(_=>false)

    let majorityIsOk = (SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM.length-afkVoters.length) >= GET_MAJORITY('QUORUM_THREAD')
    
    let rootPubIsEqualToReal = bls.aggregatePublicKeys([aggregatedPub,...afkVoters]) === SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB'+qtPayload)
    
    let mainPoolOrAtLeastReassignment = qtSubchainMetadata[blockCreator] && (tempObject.REASSIGNMENTS.has(blockCreator) && qtSubchainMetadata[blockCreator].IS_RESERVE || !qtSubchainMetadata[blockCreator].IS_RESERVE)

    let checkpointTempDB = tempObject.DATABASE



    if(signaIsOk && majorityIsOk && rootPubIsEqualToReal && hashesAreEqual && mainPoolOrAtLeastReassignment){

        await USE_TEMPORARY_DB('put',checkpointTempDB,'SFP:'+blockID,{blockID,blockHash,aggregatedPub,aggregatedSignature,afkVoters}).catch(_=>{})

        !response.aborted && response.end('OK')

    }else !response.aborted && response.end(`Something wrong because all of 5 must be true => signa_is_ok:${signaIsOk} | majority_voted_for_it:${majorityIsOk} | quorum_root_pubkey_is_current:${rootPubIsEqualToReal} | hashesAreEqual:${hashesAreEqual} | mainPoolOrAtLeastReassignment:${mainPoolOrAtLeastReassignment}`)


}),




/*

To return SUPER_FINALIZATION_PROOF related to some block PubX:Index

Only in case when we have SUPER_FINALIZATION_PROOF we can verify block with the 100% garantee that it's the part of valid subchain and will be included to checkpoint 

Params:

    [0] - blockID

Returns:

    {
        blockID,
        blockHash,
        aggregatedSignature:<>, // blockID+hash+'FINALIZATION'+QT.CHECKPOINT.HEADER.PAYLOAD_HASH+QT.CHECKPOINT.HEADER.ID
        aggregatedPub:<>,
        afkVoters
        
    }

*/
getSuperFinalization=async(response,request)=>{

    response.onAborted(()=>response.aborted=true).writeHeader('Access-Control-Allow-Origin','*')


    if(CONFIG.SYMBIOTE.TRIGGERS.GET_SUPER_FINALIZATION_PROOFS){

        let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

        if(!SYMBIOTE_META.TEMP.has(qtPayload)){

            !response.aborted && response.end('QT checkpoint is not ready')

            return
        }

       
        let superFinalizationProof = await USE_TEMPORARY_DB('get',SYMBIOTE_META.TEMP.get(qtPayload)?.DATABASE,'SFP:'+request.getParameter(0)).catch(_=>false)


        if(superFinalizationProof){

            !response.aborted && response.end(JSON.stringify(superFinalizationProof))

        }else !response.aborted && response.end('No proof')

    }else !response.aborted && response.end('Route is off')

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
            afkVoters
        
        }
    
    
    }

*/
healthChecker = async response => {

    response.onAborted(()=>response.aborted=true)

    if(CONFIG.SYMBIOTE.TRIGGERS.GET_HEALTH_CHECKER){

        // Get the latest SUPER_FINALIZATION_PROOF that we have
        let appropriateDescriptor = SYMBIOTE_META.STATIC_STUFF_CACHE.get('BLOCK_SENDER_HANDLER')

        if(!appropriateDescriptor) !response.aborted && response.end(JSON.stringify({err:`Still haven't start the procedure of grabbing finalization proofs`}))


        
        let latestFullyFinalizedHeight = appropriateDescriptor.height-1

        let block = await SYMBIOTE_META.BLOCKS.get(CONFIG.SYMBIOTE.PUB+":"+latestFullyFinalizedHeight).catch(_=>false)

        let latestHash = block && Block.genHash(block)

        let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

        if(!SYMBIOTE_META.TEMP.has(qtPayload)){

            !response.aborted && response.end('QT checkpoint is not ready')

            return
        }
       

        let superFinalizationProof = await USE_TEMPORARY_DB('get',SYMBIOTE_META.TEMP.get(qtPayload)?.DATABASE,'SFP:'+CONFIG.SYMBIOTE.PUB+":"+latestFullyFinalizedHeight).catch(_=>false)


        if(superFinalizationProof){

            let healthProof = {latestFullyFinalizedHeight,latestHash,superFinalizationProof}

            !response.aborted && response.end(JSON.stringify(healthProof))

        }else !response.aborted && response.end(JSON.stringify({err:'No proof'}))

    }else !response.aborted && response.end(JSON.stringify({err:'Route is off'}))

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

    let qtSubchainMetadata = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.PAYLOAD.POOLS_METADATA


    if(!SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.COMPLETED || !tempObject){

        !response.aborted && response.end('QT checkpoint is incomplete')

        return

    }

    
    if(tempObject.PROOFS_REQUESTS.has('NEXT_CHECKPOINT')){

        !response.aborted && response.end('Checkpoint is not fresh')
        
        return

    }

    
    let mainPoolOrAtLeastReassignment = qtSubchainMetadata[requestedSubchain] && (tempObject.REASSIGNMENTS.has(requestedSubchain) && qtSubchainMetadata[requestedSubchain].IS_RESERVE || !qtSubchainMetadata[requestedSubchain].IS_RESERVE)


    if(!mainPoolOrAtLeastReassignment){

        !response.aborted && response.end(`This pool can't be skipped(not main / no reassignments)`)
        
        return

    }

    let errorOccured

    if(await BLS_VERIFY(session+requestedSubchain+height+qtPayload,sig,initiator).catch(error=>{errorOccured=error;return false})){

        let myLocalHealthCheckingHandler = tempObject.HEALTH_MONITORING.get(requestedSubchain)

        if(myLocalHealthCheckingHandler){

            let afkLimit = SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS.SUBCHAIN_AFK_LIMIT

            let currentTime = GET_GMT_TIMESTAMP()

            if(currentTime-myLocalHealthCheckingHandler.LAST_SEEN >= afkLimit){

                !response.aborted && response.end(JSON.stringify({
                    
                    status:'SKIP',
                    
                    sig:await BLS_SIGN_DATA('SKIP_STAGE_1'+session+requestedSubchain+initiator+qtPayload)
                
                }))

            }else if(myLocalHealthCheckingHandler.INDEX>height){

                !response.aborted && response.end(JSON.stringify({
                    
                    status:'UPDATE',
                    
                    data:myLocalHealthCheckingHandler
                
                }))

            }else !response.aborted && response.end(JSON.stringify({status:`Not going to skip and my local subchain height is lower than proposed by you(local:${myLocalHealthCheckingHandler.INDEX} | your:${height})`}))
       
        }else !response.aborted && response.end('No such subchain')

    }else !response.aborted && response.end(`Signature verification failed ${JSON.stringify(errorOccured)}`)

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

    let qtSubchainMetadata = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.PAYLOAD.POOLS_METADATA

    if(!tempObject){

        !response.aborted && response.end('QT checkpoint is not ready')

        return
    }

    let mainPoolOrAtLeastReassignment = qtSubchainMetadata[subchain] && (tempObject.REASSIGNMENTS.has(subchain) && qtSubchainMetadata[subchain].IS_RESERVE || !qtSubchainMetadata[subchain].IS_RESERVE)

    if(!mainPoolOrAtLeastReassignment){

        !response.aborted && response.end(`This pool can't be skipped(not main / no reassignments)`)
        
        return

    }



    let reverseThreshold = SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS.QUORUM_SIZE-GET_MAJORITY('QUORUM_THREAD')

    let qtRootPub = SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB'+qtPayload) 

    let localSyncHandler = tempObject.CHECKPOINT_MANAGER_SYNC_HELPER.get(subchain)



    if(tempObject.PROOFS_REQUESTS.has('NEXT_CHECKPOINT')){

        !response.aborted && response.end('Checkpoint is not fresh')
    
    }else if(!SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.COMPLETED){

        !response.aborted && response.end('QT checkpoint is incomplete')
        
    }else if(tempObject.SKIP_PROCEDURE_STAGE_1.has(subchain)){

        // If we've found proofs about subchain skip procedure - vote to SKIP to perform SKIP_PROCEDURE_STAGE_2
        // We can vote to skip only for height over index that we already send commitment to
        let {INDEX,HASH} = tempObject.CHECKPOINT_MANAGER.get(subchain)

        let sigResponse = tempObject.PROOFS_RESPONSES.get('SKIP_STAGE_2:'+subchain)

        //Check if we has a signature response
        
        if(sigResponse){

            !response.aborted && response.end(JSON.stringify({status:'SKIP_STAGE_2',sig:sigResponse}))

            return
        }

        // Compare with local version of subchain segment
        if(INDEX>height){

            //Don't vote - send UPDATE response
            !response.aborted && response.end(JSON.stringify({
                    
                status:'UPDATE',
                
                data:tempObject.CHECKPOINT_MANAGER.get(subchain) //data is {INDEX,HASH,FINALIZATION_PROOF}
            
            }))

        }else if(INDEX===height && hash===HASH){

            // Add to PROOFS_REQUESTS
            tempObject.PROOFS_REQUESTS.set('SKIP_STAGE_2:'+subchain,{SUBCHAIN:subchain,INDEX,HASH})

            !response.aborted && response.end(JSON.stringify({status:'OK'}))

        
        }else if(localSyncHandler.INDEX<height && finalizationProof){

            //Verify finalization proof and update the value

            let {aggregatedPub,aggregatedSignature,afkVoters} = finalizationProof

            let data = subchain+':'+height+hash+qtPayload

            let finalizationProofIsOk = await bls.verifyThresholdSignature(aggregatedPub,afkVoters,qtRootPub,data,aggregatedSignature,reverseThreshold).catch(_=>false)

            if(finalizationProofIsOk){

                localSyncHandler.INDEX = height

                localSyncHandler.HASH = hash

                localSyncHandler.FINALIZATION_PROOF = finalizationProof

            }

            !response.aborted && response.end(JSON.stringify({status:'LOCAL_UPDATE'}))

        }else !response.aborted && response.end(JSON.stringify({status:'Local subchain height is bigger than proposed by you or finalization proof have wrong format'}))

    }else !response.aborted && response.end(JSON.stringify({status:'Subchain not found'}))


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

    if(!tempObject){

        !response.aborted && response.end('QT checkpoint is not ready')

        return
    }

    let skipProof = tempObject.PROOFS_RESPONSES.get(`SKIP_STAGE_3:${subchain}`)

    if(!SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.COMPLETED){

        !response.aborted && response.end(JSON.stringify({status:'QT checkpoint is incomplete'}))

        return
        
    }

    if(skipProof){

        // If we've found proofs about subchain skip procedure stage 2(so we know the height/hash)- vote to SKIP to perform SKIP_PROCEDURE_STAGE_3

        !response.aborted && response.end(JSON.stringify({status:'SKIP_STAGE_3',sig:skipProof}))
        
    }else !response.aborted && response.end(JSON.stringify({status:`Can't get SKIP_STAGE_3 proofs. Try to repeat stage 1 and 2`}))


}),




/**
 * 
 * [Info]:
 * 
 *      Route mostly for explorers & other software which should know that some subchain was skipped for current checkpoint
 * 
 * [Accept]
 * 
 *      0-subchain
 * 
 * [Returns]
 * 
 *     SKIP_STAGE_3 aggregated proof for given subchain => {subchain,index,hash,aggregatedPub,aggregatedSignature,afkVoters}
 * 
 */
getSkipProcedureStage3 = async (response,request) => {


    response.onAborted(()=>response.aborted=true).writeHeader('Access-Control-Allow-Origin','*')

    
    let subchain = request.getParameter(0)
    
    let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

    let tempObject = SYMBIOTE_META.TEMP.get(qtPayload)


    if(!tempObject){

        !response.aborted && response.end(JSON.stringify({error:'QT checkpoint is not ready'}))

        return
    }

    if(!SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.COMPLETED){

        !response.aborted && response.end(JSON.stringify({error:'QT checkpoint is incomplete'}))

        return
        
    }

    let skipStage3Proof = await USE_TEMPORARY_DB('get',tempObject.DATABASE,'SKIP_STAGE_3:'+subchain).catch(_=>false)


    if(skipStage3Proof) !response.aborted && response.end(JSON.stringify(skipStage3Proof))

    else !response.aborted && response.end(JSON.stringify({error:'No SKIP_STAGE_3 for given subchain'}))

},




/*

Used to accept aggregated version of SKIP_STAGE_3 proofs

[Accept]:

    {subchain,index,hash,aggregatedPub,aggregatedSignature,afkVoters}

[Returns]:

    'OK'

*/
acceptAggregatedSkipStage3=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    let aggregatedVersionOfSkipStage3=await BODY(bytes,CONFIG.MAX_PAYLOAD_SIZE)
    
    let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

    let tempObject = SYMBIOTE_META.TEMP.get(qtPayload)


    if(!tempObject){

        !response.aborted && response.end('QT checkpoint is not ready')

        return
    }

    
    let {subchain,index,hash,aggregatedPub,aggregatedSignature,afkVoters} = aggregatedVersionOfSkipStage3


    if(typeof aggregatedPub !== 'string' || typeof aggregatedSignature !== 'string' || typeof subchain !== 'string' || typeof hash !== 'string' || typeof index !== 'number' || !Array.isArray(afkVoters)){

        !response.aborted && response.end('Wrong format of input params')

        return

    }


    let dataThatShouldBeSigned = `SKIP_STAGE_3:${subchain}:${index}:${hash}:${qtPayload}`

    let majorityIsOk =  (SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM.length-afkVoters.length) >= GET_MAJORITY('QUORUM_THREAD')
        
    let signaIsOk = await bls.singleVerify(dataThatShouldBeSigned,aggregatedPub,aggregatedSignature).catch(_=>false)

    let rootPubIsEqualToReal = bls.aggregatePublicKeys([aggregatedPub,...afkVoters]) === SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB'+qtPayload)
    
            
    if(signaIsOk && majorityIsOk && rootPubIsEqualToReal){

        tempObject.PROOFS_REQUESTS.set('REASSIGN:'+subchain,{subchain,index,hash,aggregatedPub,aggregatedSignature,afkVoters})

        !response.aborted && response.end('OK')
                
    }else !response.aborted && response.end(`Something wrong because all of 3 must be true => signa_is_ok:${signaIsOk} | majority_voted_for_it:${majorityIsOk} | quorum_root_pubkey_is_current:${rootPubIsEqualToReal}`)


}),




/*

Accept checkpoints from other pools in quorum and returns own version as answer
! Check the trigger START_SHARING_CHECKPOINT

[Accept]:


{
    
    ISSUER:<BLS pubkey of checkpoint grabbing initiator>,

    PREV_CHECKPOINT_PAYLOAD_HASH: SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH,
    
    POOLS_METADATA: {
                
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

    if(typeof checkpointProposition.ISSUER !== 'string' || typeof checkpointProposition.PREV_CHECKPOINT_PAYLOAD_HASH !== 'string' || typeof checkpointProposition.POOLS_METADATA !== 'object' || !Array.isArray(checkpointProposition.OPERATIONS)){

        !response.aborted && response.end(JSON.stringify({error:'Wrong input formats'}))

        return

    }

    let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

    let currentPoolsMetadata = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.PAYLOAD.POOLS_METADATA

    let tempObject = SYMBIOTE_META.TEMP.get(qtPayload)

    let specialOperationsMempool = tempObject?.SPECIAL_OPERATIONS_MEMPOOL
    

    if(!SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.COMPLETED || !tempObject) {

        !response.aborted && response.end(JSON.stringify({error:'QT checkpoint is incomplete'}))

        return

    }

    if(!tempObject.PROOFS_RESPONSES.has('READY_FOR_CHECKPOINT')){

        !response.aborted && response.end(JSON.stringify({error:'This checkpoint is fresh or not ready for checkpoint'}))

        return

    }
    

    // Create copy to delete from
    let subchainsToSkipThatCantBeExcluded = new Set(tempObject.SKIP_PROCEDURE_STAGE_2.keys())

    // [0] Check which operations we don't have locally in mempool - it's signal to exclude it from proposition
    
    let excludeSpecOperations = checkpointProposition.OPERATIONS.filter(
        
        operation => {

            if(specialOperationsMempool.has(operation.id)){

                // If operation exists - check if it's STOP_VALIDATOR operation. Mark it if it's <SKIP> operation(i.e. stop=true)
                if(operation.type==='STOP_VALIDATOR' && operation.payload?.stop === true) {

                    subchainsToSkipThatCantBeExcluded.delete(operation.payload?.subchain)
                }

                return false

            }else return true // Exclude operations which we don't have
        
        }
        
    ).map(operation => operation.id)



    
    if(excludeSpecOperations.length !== 0){

        
        !response.aborted && response.end(JSON.stringify({excludeSpecOperations}))


    }else if (subchainsToSkipThatCantBeExcluded.size===0){

        // On this step we know that all of proposed operations were checked by us and present in local mempool.
        // Also, we know that all the mandatory STOP_VALIDATOR operations are in current version of payload


        
        // [1] Compare proposed POOLS_METADATA with local copy of SYMBIOTE_META.CHECKPOINT_MANAGER

        let metadataUpdate = []
        
        let wrongSkipStatusPresent=false, subchainWithWrongStopIndex

        let subchains = Object.keys(checkpointProposition.POOLS_METADATA)

        let localCopyOfSubchains = Object.keys(currentPoolsMetadata)

        if(subchains.toString() !== localCopyOfSubchains.toString()){

            !response.aborted && response.end(JSON.stringify({error:`Subchains set are not equal with my version of subchains metadata since previous checkpoint ${SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID} ### ${SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH}`}))

            return

        }


        for(let subchain of subchains){

            let localVersion = tempObject.CHECKPOINT_MANAGER.get(subchain)
            
            if(checkpointProposition.POOLS_METADATA[subchain].IS_STOPPED !== currentPoolsMetadata[subchain].IS_STOPPED || currentPoolsMetadata[subchain].IS_RESERVE !== checkpointProposition.POOLS_METADATA[subchain].IS_RESERVE) {

                wrongSkipStatusPresent=true

                subchainWithWrongStopIndex=subchain

                break

            }

            if(localVersion?.INDEX > checkpointProposition.POOLS_METADATA[subchain].INDEX){

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

            !response.aborted && response.end(JSON.stringify({error:`Wrong <IS_STOPPED> for subchain ${subchainWithWrongStopIndex}`}))

        }
        else if(metadataUpdate.length!==0){

            !response.aborted && response.end(JSON.stringify({metadataUpdate}))

        }else if(checkpointProposition.PREV_CHECKPOINT_PAYLOAD_HASH === SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH){

            let finalVersionToSign = {

                ISSUER:checkpointProposition.ISSUER,
                PREV_CHECKPOINT_PAYLOAD_HASH:checkpointProposition.PREV_CHECKPOINT_PAYLOAD_HASH,                
                POOLS_METADATA:checkpointProposition.PREV_CHECKPOINT_PAYLOAD_HASH,
                OPERATIONS:checkpointProposition.OPERATIONS,
                OTHER_SYMBIOTES:{}                        
            
            }

            let sig = await BLS_SIGN_DATA(BLAKE3(JSON.stringify(finalVersionToSign)))

            !response.aborted && response.end(JSON.stringify({sig}))

        }else !response.aborted && response.end(JSON.stringify({error:`Everything failed(wrongSkipStatusPresent:false | metadataUpdate.length!==0 | hashes not equal)`}))

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
        afkVoters:[]

    }

    ISSUER_PROOF:SIG(ISSUER+PAYLOAD_HASH)

    CHECKPOINT_PAYLOAD:{

        ISSUER:<BLS pubkey of checkpoint grabbing initiator>
            
        PREV_CHECKPOINT_PAYLOAD_HASH: SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH,
            
        POOLS_METADATA: {
                
            '7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta': {INDEX,HASH,IS_STOPPED,IS_RESERVE}

            /..other data
            
        },
        OPERATIONS: GET_SPEC_EVENTS(),
        OTHER_SYMBIOTES: {}
        
    }


}

To verify it => VERIFY(aggPub,aggSigna,afkVoters,data), where data - BLAKE3(JSON.stringify(<PROPOSED PAYLOAD>))

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

    let tempObject = SYMBIOTE_META.TEMP.get(qtPayload)


    if(!SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.COMPLETED || !tempObject){

        !response.aborted && response.end(JSON.stringify({error:'QT checkpoint is incomplete'}))

        return

    }


    let checkpointProofsResponses = tempObject.PROOFS_RESPONSES

    let {CHECKPOINT_FINALIZATION_PROOF,CHECKPOINT_PAYLOAD,ISSUER_PROOF}=await BODY(bytes,CONFIG.MAX_PAYLOAD_SIZE)


    if(!checkpointProofsResponses.has('READY_FOR_CHECKPOINT')){

        !response.aborted && response.end(JSON.stringify({error:'This checkpoint is fresh or not ready for checkpoint'}))

        return

    }

    if(!CHECKPOINT_FINALIZATION_PROOF){

        !response.aborted && response.end(JSON.stringify({error:'No CHECKPOINT_FINALIZATION_PROOF in input data'}))

        return

    }


    let {aggregatedPub,aggregatedSignature,afkVoters} = CHECKPOINT_FINALIZATION_PROOF

    let payloadHash = BLAKE3(JSON.stringify(CHECKPOINT_PAYLOAD))

    let checkpointTemporaryDB = tempObject.DATABASE



    let payloadIsAlreadyInDb = await USE_TEMPORARY_DB('get',checkpointTemporaryDB,payloadHash).catch(_=>false)

    let proposerAlreadyInDB = await USE_TEMPORARY_DB('get',checkpointTemporaryDB,'PROPOSER_'+CHECKPOINT_PAYLOAD.ISSUER).catch(_=>false)
    


    if(payloadIsAlreadyInDb){

        let sig = await BLS_SIGN_DATA('STAGE_2'+payloadHash)

        !response.aborted && response.end(JSON.stringify({sig}))

    }else if(proposerAlreadyInDB){

        !response.aborted && response.end(JSON.stringify({error:`You've already sent a majority agreed payload for checkpoint`}))

    }
    else{

        let reverseThreshold = SYMBIOTE_META.QUORUM_THREAD.WORKFLOW_OPTIONS.QUORUM_SIZE-GET_MAJORITY('QUORUM_THREAD')

        //Verify 2 signatures

        let majorityHasSignedIt = await bls.verifyThresholdSignature(aggregatedPub,afkVoters,SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB'+qtPayload),payloadHash,aggregatedSignature,reverseThreshold).catch(error=>({error}))

        let issuerSignatureIsOk = await bls.singleVerify(CHECKPOINT_PAYLOAD.ISSUER+payloadHash,CHECKPOINT_PAYLOAD.ISSUER,ISSUER_PROOF).catch(error=>({error}))



        if(issuerSignatureIsOk.error){

            !response.aborted && response.end(JSON.stringify({error:`Issuer signature is not ok => ${issuerSignatureIsOk.error}`}))

            return

        }

        if(majorityHasSignedIt.error){

            !response.aborted && response.end(JSON.stringify({error:`Majority signature is not ok => ${majorityHasSignedIt.error}`}))

            return

        }
        

        if(majorityHasSignedIt && issuerSignatureIsOk){

            // Store locally, mark that this issuer has already sent us a finalized version of checkpoint

            try{

                let atomicBatch = checkpointTemporaryDB.batch()

                atomicBatch.put('PROPOSER_'+CHECKPOINT_PAYLOAD.ISSUER,true)
            
                atomicBatch.put(payloadHash,CHECKPOINT_PAYLOAD)

                await atomicBatch.write()

                // Generate the signature for the second stage

                let sig = await BLS_SIGN_DATA('STAGE_2'+payloadHash)

                !response.aborted && response.end(JSON.stringify({sig}))

            }catch{

                !response.aborted && response.end(JSON.stringify({error:'Something wrong with batch'}))

            }
            
        }else !response.aborted && response.end(JSON.stringify({error:'Something wrong'}))

    }

}),




/*

To return payload of some checkpoint by it's hash

Params:

    [0] - payloadHash


Returns:

    {
        PREV_CHECKPOINT_PAYLOAD_HASH: '',
        POOLS_METADATA: [Object],
        OPERATIONS: [],
        OTHER_SYMBIOTES: {}
    }

*/
getPayloadForCheckpoint=async(response,request)=>{

    response.onAborted(()=>response.aborted=true)

    if(CONFIG.SYMBIOTE.TRIGGERS.GET_PAYLOAD_FOR_CHECKPOINT){

        let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

        if(!SYMBIOTE_META.TEMP.has(qtPayload)){

            !response.aborted && response.end('QT checkpoint is not ready')
        
            return

        }

        let checkpointTemporaryDB = SYMBIOTE_META.TEMP.get(qtPayload).DATABASE

        let payloadHash = request.getParameter(0),

            checkpoint = await USE_TEMPORARY_DB('get',checkpointTemporaryDB,payloadHash).catch(_=>false) || await SYMBIOTE_META.CHECKPOINTS.get(payloadHash).then(headerAndPayload=>headerAndPayload.PAYLOAD).catch(_=>false)

        if(checkpoint){

            !response.aborted && response.end(JSON.stringify(checkpoint))

        }else !response.aborted && response.end('No checkpoint')

    }else !response.aborted && response.end('Route is off')

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

    if(!SYMBIOTE_META.TEMP.has(qtPayload)){

        !response.aborted && response.end('QT checkpoint is not ready')

        return
    }

    let specialOperationsMempool = SYMBIOTE_META.TEMP.get(qtPayload).SPECIAL_OPERATIONS_MEMPOOL


    if(!SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.COMPLETED){

        !response.aborted && response.end('QT checkpoint is incomplete. Wait some time and repeat the operation later')

        return
    }

    if(!CONFIG.SYMBIOTE.TRIGGERS.ACCEPT_SPECIAL_OPERATIONS){

        !response.aborted && response.end(`Route is off. This node don't accept special operations`)

        return
    }

    if(specialOperationsMempool.size >= CONFIG.SYMBIOTE.SPECIAL_OPERATIONS_MEMPOOL_SIZE){

        !response.aborted && response.end('Mempool for special operations is full')
    
        return
    }

    //Verify and if OK - put to SPECIAL_OPERATIONS_MEMPOOL

    if(OPERATIONS_VERIFIERS[operation.type]){

        let possibleSpecialOperation = await OPERATIONS_VERIFIERS[operation.type](operation.payload,true,false).catch(error=>({isError:true,error})) //it's just verify without state changes

        if(possibleSpecialOperation?.isError){
            
            !response.aborted && response.end(`Verification failed. Reason => ${JSON.stringify(possibleSpecialOperation)}`)

        }
        else if(possibleSpecialOperation){

            // Assign the ID to operation to easily detect what we should exclude from checkpoints propositions
            let payloadHash = BLAKE3(JSON.stringify(possibleSpecialOperation.payload))

            possibleSpecialOperation.id = payloadHash

            // Add to mempool
            specialOperationsMempool.set(payloadHash,possibleSpecialOperation)

            !response.aborted && response.end('OK')
       
        }
        else !response.aborted && response.end(`Verification failed.Check your input data carefully. The returned object from function => ${JSON.stringify(possibleSpecialOperation)}`)

    }else !response.aborted && response.end(`No verification function for this special operation => ${operation.type}`)

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
    
    let acceptedData = await BODY(bytes,CONFIG.PAYLOAD_SIZE)

    if(!Array.isArray(acceptedData)){

        !response.aborted && response.end('Input must be a 2-elements array like [symbioteID,you_endpoint]')
        
        return

    }

    let [symbiote,domain]=acceptedData
   
    if(CONFIG.SYMBIOTE.SYMBIOTE_ID!==symbiote){

        !response.aborted && response.end('Symbiote not supported')
        
        return

    }

    if(!CONFIG.SYMBIOTE.TRIGGERS.ACCEPT_NEW_NODES){

        !response.aborted && response.end('Route is off')
        
        return
    }
    
    if(typeof domain==='string' && domain.length<=256){
        
        //Add more advanced logic in future(or use plugins - it's even better)
        let nodes=SYMBIOTE_META.PEERS
        
        if(!(nodes.includes(domain) || CONFIG.SYMBIOTE.BOOTSTRAP_NODES.includes(domain))){
            
            nodes.length<CONFIG.SYMBIOTE.MAX_CONNECTIONS
            ?
            nodes.push(domain)
            :
            nodes[~~(Math.random() * nodes.length)]=domain//if no place-paste instead of random node
    
            !response.aborted && response.end('Your node has been added')
    
        }else !response.aborted && response.end('Your node already in scope')
    
    }else !response.aborted && response.end('Wrong types => endpoint(domain) must be 256 chars in length or less')

})








UWS_SERVER

//1st stage - accept block and response with the commitment

//2nd stage - accept aggregated commitments and response with the FINALIZATION_PROOF
.post('/finalization',finalization)


// .post('/many_finalization',manyFinalization)

//3rd stage - logic with super finalization proofs. Accept SUPER_FINALIZATION_PROOF(aggregated 2/3N+1 FINALIZATION_PROOFs from QUORUM members)
.post('/super_finalization',superFinalization)

.get('/super_finalization/:BLOCK_ID',getSuperFinalization)


.get('/payload_for_checkpoint/:PAYLOAD_HASH',getPayloadForCheckpoint)

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

.get('/skip_procedure_stage_3/:SUBCHAIN',getSkipProcedureStage3)

.post('/accept_aggregated_skip_stage_3_proof',acceptAggregatedSkipStage3)

.post('/block',acceptBlocks)

// .post('/many_blocks',acceptManyBlocks)

.post('/event',acceptEvents)

.post('/addpeer',addPeer)