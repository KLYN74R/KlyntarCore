import {BLS_VERIFY,BLS_SIGN_DATA,GET_MAJORITY,USE_TEMPORARY_DB} from '../utils.js'

import SYSTEM_SYNC_OPERATIONS_VERIFIERS from '../systemOperationsVerifiers.js'

import{BODY,SAFE_ADD,PARSE_JSON,BLAKE3} from '../../../KLY_Utils/utils.js'

import bls from '../../../KLY_Utils/signatures/multisig/bls.js'

import Block from '../essences/block.js'




let BLS_PUBKEY_FOR_FILTER = global.CONFIG.SYMBIOTE.PRIME_POOL_PUBKEY || global.CONFIG.SYMBIOTE.PUB,




//__________________________________________________________BASIC FUNCTIONAL_____________________________________________________________________



/*

[Description]:
    Accept blocks and return commitment if subchain sequence completed
  
[Accept]:

    Blocks
  
    {
        creator:'7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta',
        time:1666744452126,
        transactions:[
            tx1,
            tx2,
            tx3,
        ]
        index:1337,
        prevHash:'0123456701234567012345670123456701234567012345670123456701234567',
        sig:'jXO7fLynU9nvN6Hok8r9lVXdFmjF5eye09t+aQsu+C/wyTWtqwHhPwHq/Nl0AgXDDbqDfhVmeJRKV85oSEDrMjVJFWxXVIQbNBhA7AZjQNn7UmTI75WAYNeQiyv4+R4S'
    }


[Response]:

    SIG(blockID+hash+checkpointFullID) => jXO7fLynU9nvN6Hok8r9lVXdFmjF5eye09t+aQsu+C/wyTWtqwHhPwHq/Nl0AgXDDbqDfhVmeJRKV85oSEDrMjVJFWxXVIQbNBhA7AZjQNn7UmTI75WAYNeQiyv4+R4S

    <OR> nothing

*/
acceptBlocks=response=>{
    
    let total=0
    
    let buffer=Buffer.alloc(0)
    
    let checkpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.payloadHash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.id

    let poolsMetadataOnQuorumThread = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.payload.poolsMetadata

    let tempObject = global.SYMBIOTE_META.TEMP.get(checkpointFullID)


    //Check if we should accept this block.NOTE-use this option only in case if you want to stop accept blocks or override this process via custom runtime scripts or external services
    if(!global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.MAIN.ACCEPT_BLOCK){
        
        !response.aborted && response.end(JSON.stringify({err:'Route is off'}))
        
        return
    
    }

    if(!global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.completed || !tempObject){

        !response.aborted && response.end(JSON.stringify({err:'QT checkpoint is incomplete'}))

        return

    }

    if(tempObject.PROOFS_REQUESTS.has('NEXT_CHECKPOINT')){

        !response.aborted && response.end(JSON.stringify({err:'Checkpoint is not fresh'}))
        
        return

    }

    
    response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async(chunk,last)=>{

        if(total+chunk.byteLength<=global.CONFIG.MAX_PAYLOAD_SIZE){
        
            buffer=await SAFE_ADD(buffer,chunk,response)//build full data from chunks
    
            total+=chunk.byteLength
        
            if(last){
            
                let block = await PARSE_JSON(buffer)

                let poolIsAFK = tempObject.SKIP_HANDLERS.has(block.creator) || tempObject.PROOFS_REQUESTS.has('CREATE_SKIP_HANDLER:'+block.creator)
            

                if(poolIsAFK){

                    !response.aborted && response.end(JSON.stringify({err:'This pool is AFK'}))
        
                    return

                }

                let primePoolOrAtLeastReassignment = poolsMetadataOnQuorumThread[block.creator] && (tempObject.REASSIGNMENTS.has(block.creator) && poolsMetadataOnQuorumThread[block.creator].isReserve || !poolsMetadataOnQuorumThread[block.creator].isReserve)


                if(!primePoolOrAtLeastReassignment){

                    !response.aborted && response.end(JSON.stringify({err:`This block creator can't produce blocks`}))
        
                    return

                }
                


                let hash=Block.genHash(block)


                let myCommitment = await USE_TEMPORARY_DB('get',tempObject.DATABASE,block.creator+":"+block.index).catch(_=>false)
                
                if(myCommitment){

                    !response.aborted && response.end(JSON.stringify({commitment:myCommitment}))

                    return
                
                }
                
                let checkIfItsChain = block.index===0 || await global.SYMBIOTE_META.BLOCKS.get(block.creator+":"+(block.index-1)).then(prevBlock=>{

                    //Compare hashes to make sure it's a chain

                    let prevHash = Block.genHash(prevBlock)

                    return prevHash === block.prevHash

                }).catch(_=>false)


                //Otherwise - check if we can accept this block

                let allow=
            
                    typeof block.index==='number' && typeof block.prevHash==='string' && typeof block.sig==='string' && Array.isArray(block.transactions)//make general lightweight overview
                    &&
                    await BLS_VERIFY(hash,block.sig,block.creator).catch(_=>false)//and finally-the most CPU intensive task
                    &&
                    checkIfItsChain
                

                if(allow){
                
                    let blockID = block.creator+":"+block.index
                    
                    //Store it locally-we'll work with this block later
                    global.SYMBIOTE_META.BLOCKS.get(blockID).catch(
                            
                        _ =>
                            
                            global.SYMBIOTE_META.BLOCKS.put(blockID,block).catch(_=>{})
                         
                    )
                    

                    let commitment = await BLS_SIGN_DATA(blockID+hash+checkpointFullID)
                

                    //Put to local storage to prevent double voting
                    await USE_TEMPORARY_DB('put',tempObject.DATABASE,blockID,commitment).then(()=>
    
                        !response.aborted && response.end(JSON.stringify({commitment:commitment}))
                    
                    ).catch(error=>!response.aborted && response.end(JSON.stringify({err:`Something wrong => ${JSON.stringify(error)}`})))


                }else !response.aborted && response.end(JSON.stringify({err:'Overview failed. Make sure input data is ok'}))
            
            }
        
        }else !response.aborted && response.end(JSON.stringify({err:'Payload limit'}))
    
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
            txs:[
                tx1,
                tx2,
                tx3,
            ]
            index:1337,
            prevHash:'0123456701234567012345670123456701234567012345670123456701234567',
            sig:'jXO7fLynU9nvN6Hok8r9lVXdFmjF5eye09t+aQsu+C/wyTWtqwHhPwHq/Nl0AgXDDbqDfhVmeJRKV85oSEDrMjVJFWxXVIQbNBhA7AZjQNn7UmTI75WAYNeQiyv4+R4S'
        }

    ]
  

[Response]:

    SIG(blockID+hash+checkpointFullID) => jXO7fLynU9nvN6Hok8r9lVXdFmjF5eye09t+aQsu+C/wyTWtqwHhPwHq/Nl0AgXDDbqDfhVmeJRKV85oSEDrMjVJFWxXVIQbNBhA7AZjQNn7UmTI75WAYNeQiyv4+R4S

    <OR> nothing

*/
acceptManyBlocks=response=>{
    
    let total=0
    
    let buffer=Buffer.alloc(0)
    
    let checkpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.payloadHash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.id

    let tempObject = global.SYMBIOTE_META.TEMP.get(checkpointFullID)


    //Check if we should accept this block.NOTE-use this option only in case if you want to stop accept blocks or override this process via custom runtime scripts or external services
    if(!global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.MAIN.ACCEPT_BLOCKS){
        
        !response.aborted && response.end(JSON.stringify({err:'Route is off'}))
        
        return
    
    }

    if(!global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.completed || !tempObject){

        !response.aborted && response.end(JSON.stringify({err:'QT checkpoint is incomplete'}))

        return

    }

    if(tempObject.PROOFS_REQUESTS.has('NEXT_CHECKPOINT')){

        !response.aborted && response.end(JSON.stringify({err:'Checkpoint is not fresh'}))
        
        return

    }

    

    response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async(chunk,last)=>{

        if(total+chunk.byteLength<=global.CONFIG.MAX_PAYLOAD_SIZE){
        
            buffer=await SAFE_ADD(buffer,chunk,response)//build full data from chunks
    
            total+=chunk.byteLength
        
            if(last){
            
                
                let blocksBatch=await PARSE_JSON(buffer)

                let commitmentsMap={}


                for(let block of blocksBatch){

                    let blockID = block.creator+":"+block.index

                    let poolIsSkipped = tempObject.SKIP_HANDLERS.has(block.creator) || tempObject.PROOFS_REQUESTS.has('CREATE_SKIP_HANDLER:'+block.creator)
                
                    if(poolIsSkipped) continue
   
                    
                    let hash=Block.genHash(block)
    
    
                    let myCommitment = await USE_TEMPORARY_DB('get',tempObject.DATABASE,blockID).catch(_=>false)
             
    
                    if(myCommitment){

                        commitmentsMap[blockID]=myCommitment
    
                        continue
                    
                    }
   
                    
                    let checkIfItsChain = block.index===0 || await global.SYMBIOTE_META.BLOCKS.get(block.creator+":"+(block.index-1)).then(prevBlock=>{
    
                        //Compare hashes to make sure it's a chain
    
                        let prevHash = Block.genHash(prevBlock)
    
                        return prevHash === block.prevHash
    
                    }).catch(_=>false)
   
    
                    //Otherwise - check if we can accept this block
    
                    let allow=
                
                        typeof block.transactions==='object' && typeof block.index==='number' && typeof block.prevHash==='string' && typeof block.sig==='string'//make general lightweight overview
                        &&
                        await BLS_VERIFY(hash,block.sig,block.creator).catch(_=>false)//and finally-the most CPU intensive task
                        &&
                        checkIfItsChain
                    
    
    
                    if(allow){
  
                        
                        //Store it locally-we'll work with this block later
                        await global.SYMBIOTE_META.BLOCKS.get(blockID).catch(
                                
                            _ => global.SYMBIOTE_META.BLOCKS.put(blockID,block).catch(_=>{})
                             
                        )
                        
                        
                        let commitment = await BLS_SIGN_DATA(blockID+hash+checkpointFullID)
                    
    
                        //Put to local storage to prevent double voting
                        await USE_TEMPORARY_DB('put',tempObject.DATABASE,blockID,commitment).then(()=>
        
                            commitmentsMap[blockID]=commitment
                        
                        ).catch(_=>{})
    
    
                    }

                    
                }

                !response.aborted && response.end(JSON.stringify(commitmentsMap))  
            
            }
        
        }else !response.aborted && response.end(JSON.stringify({err:'Payload limit'}))
    
    })

},




//Format of body : <transaction>
//There is no <creator> field-we get it from tx
acceptTransactions=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    let transaction = await BODY(bytes,global.CONFIG.MAX_PAYLOAD_SIZE)
    
    //Reject all txs if route is off and other guards methods

    /*
    
        ...and do such "lightweight" verification here to prevent db bloating
        Anyway we can bump with some short-term desynchronization while perform operations over block
        Verify and normalize object
        Fetch values about fees and MC from some decentralized sources
    
        The second operand tells us:if buffer is full-it makes whole logical expression FALSE
        Also check if we have normalizer for this type of event

    
    */

    if(typeof transaction?.creator!=='string' || typeof transaction.nonce!=='number' || typeof transaction.sig!=='string'){

        !response.aborted && response.end(JSON.stringify({err:'Event structure is wrong'}))

        return
    }

    if(!global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.MAIN.ACCEPT_TXS){
        
        !response.aborted && response.end(JSON.stringify({err:'Route is off'}))
        
        return
        
    }

    if(!global.SYMBIOTE_META.FILTERS[transaction.type]){

        !response.aborted && response.end(JSON.stringify({err:'No such filter. Make sure your <tx.type> is supported by current version of workflow runned on symbiote'}))
        
        return

    }

    
    if(global.SYMBIOTE_META.MEMPOOL.length<global.CONFIG.SYMBIOTE.TXS_MEMPOOL_SIZE){

        let filteredEvent=await global.SYMBIOTE_META.FILTERS[transaction.type](transaction,BLS_PUBKEY_FOR_FILTER)

        if(filteredEvent){

            !response.aborted && response.end(JSON.stringify({status:'OK'}))

            global.SYMBIOTE_META.MEMPOOL.push(filteredEvent)
                        
        }else !response.aborted && response.end(JSON.stringify({err:`Can't get filtered value of tx`}))

    }else !response.aborted && response.end(JSON.stringify({err:'Mempool is fullfilled'}))

}),




FINALIZATION_PROOFS_POLLING=(tempObject,blockID,response)=>{


    if(tempObject.PROOFS_RESPONSES.has(blockID)){

        // Instantly send response
        !response.aborted && response.end(tempObject.PROOFS_RESPONSES.get(blockID))

    }else{

        //Wait a while

        setImmediate(()=>FINALIZATION_PROOFS_POLLING(tempObject,blockID,response))

    }


},


/*

[Description]:
    
    Accept aggregated commitments which proofs us that 2/3N+1 has the same block and generate FINALIZATION_PROOF => SIG(blockID+hash+'FINALIZATION'+checkpointFullID)

[Accept]:

Aggregated version of commitments. This is the proof that 2/3N+1 has received the blockX with hash H and created the commitment(SIG(blockID+hash+checkpointFullID))


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

    If everything is OK - response with signa SIG(blockID+hash+'FINALIZATION'+checkpointFullID)

    
*/
finalization=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    let aggregatedCommitments=await BODY(bytes,global.CONFIG.PAYLOAD_SIZE)

    if(global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.MAIN.SHARE_FINALIZATION_PROOF && global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.completed){


        let checkpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.payloadHash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.id

        if(!global.SYMBIOTE_META.TEMP.has(checkpointFullID)){

            !response.aborted && response.end(JSON.stringify({err:'QT checkpoint is incomplete'}))

            return
        }

        
        let tempObject = global.SYMBIOTE_META.TEMP.get(checkpointFullID)

        let poolsMetadataOnQuorumThread = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.payload.poolsMetadata


        if(tempObject.PROOFS_REQUESTS.has('NEXT_CHECKPOINT')){

            !response.aborted && response.end(JSON.stringify({err:'Checkpoint is not fresh'}))
            
    
        }else if(tempObject.PROOFS_RESPONSES.has(aggregatedCommitments.blockID)){

            // Instantly send response
            !response.aborted && response.end(JSON.stringify({fp:tempObject.PROOFS_RESPONSES.get(aggregatedCommitments.blockID)}))


        }else{

            
            let {blockID,blockHash,aggregatedPub,aggregatedSignature,afkVoters} = aggregatedCommitments

            if(typeof aggregatedPub !== 'string' || typeof aggregatedSignature !== 'string' || typeof blockID !== 'string' || typeof blockHash !== 'string' || !Array.isArray(afkVoters)){

                !response.aborted && response.end(JSON.stringify({err:'Wrong format of input params'}))

                return

            }

            let [blockCreator,_] = blockID.split(':')


            let majorityIsOk =  (global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.quorum.length-afkVoters.length) >= GET_MAJORITY('QUORUM_THREAD')

            let signaIsOk = await bls.singleVerify(blockID+blockHash+checkpointFullID,aggregatedPub,aggregatedSignature).catch(_=>false)
    
            let rootPubIsEqualToReal = bls.aggregatePublicKeys([aggregatedPub,...afkVoters]) === global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB'+checkpointFullID)
    
            let primePoolOrAtLeastReassignment = poolsMetadataOnQuorumThread[blockCreator] && (tempObject.REASSIGNMENTS.has(blockCreator) && poolsMetadataOnQuorumThread[blockCreator].isReserve || !poolsMetadataOnQuorumThread[blockCreator].isReserve)
            
            
            if(signaIsOk && majorityIsOk && rootPubIsEqualToReal && primePoolOrAtLeastReassignment){

                // Add request to sync function 
                tempObject.PROOFS_REQUESTS.set(blockID,{hash:blockHash,aggregatedCommitments:{aggregatedPub,aggregatedSignature,afkVoters}})
    
                FINALIZATION_PROOFS_POLLING(tempObject,blockID,response)
                
            }else !response.aborted && response.end(JSON.stringify({err:`Something wrong because all of 4 must be true => signa_is_ok:${signaIsOk} | majority_voted_for_it:${majorityIsOk} | quorum_root_pubkey_is_current:${rootPubIsEqualToReal} | primePoolOrAtLeastReassignment:${primePoolOrAtLeastReassignment}`}))

        }

    }else !response.aborted && response.end(JSON.stringify({err:'Route is off or QT checkpoint is incomplete'}))

}),




MANY_FINALIZATION_PROOFS_POLLING=(tempObject,blocksSet,response)=>{

    if(blocksSet.every(blockID=>tempObject.PROOFS_RESPONSES.has(blockID))){

        let fpArray=blocksSet.map(blockID=>{

            let fp = tempObject.PROOFS_RESPONSES.get(blockID)

            tempObject.PROOFS_RESPONSES.delete(blockID)

            return fp

        })


        // Instantly send response
        !response.aborted && response.end(JSON.stringify({err:JSON.stringify(fpArray)}))

    }else{

        //Wait a while

        setImmediate(()=>MANY_FINALIZATION_PROOFS_POLLING(tempObject,blocksSet,response))

    }


},




manyFinalization=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    let aggregatedCommitmentsArray=await BODY(bytes,global.CONFIG.MAX_PAYLOAD_SIZE)

    let blocksSet = []

    if(global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.MAIN.SHARE_FINALIZATION_PROOF && global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.completed){


        let checkpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.payloadHash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.id

        if(!global.SYMBIOTE_META.TEMP.has(checkpointFullID)){

            !response.aborted && response.end(JSON.stringify({err:'QT checkpoint is incomplete'}))

            return
        }

        let tempObject = global.SYMBIOTE_META.TEMP.get(checkpointFullID)

        if(tempObject.PROOFS_REQUESTS.has('NEXT_CHECKPOINT')){

            !response.aborted && response.end(JSON.stringify({err:'Checkpoint is not fresh'}))
            
    
        }
        
        
        for(let aggragatedCommitment of aggregatedCommitmentsArray){

            let {blockID,blockHash,aggregatedPub,aggregatedSignature,afkVoters} = aggragatedCommitment
    

            if(typeof aggregatedPub !== 'string' || typeof aggregatedSignature !== 'string' || typeof blockID !== 'string' || typeof blockHash !== 'string' || !Array.isArray(afkVoters)){

                !response.aborted && response.end(JSON.stringify({err:'Wrong format of input params'}))

                return

            }

            let majorityIsOk =  (global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.quorum.length-afkVoters.length) >= GET_MAJORITY('QUORUM_THREAD')

            let signaIsOk = await bls.singleVerify(blockID+blockHash+checkpointFullID,aggregatedPub,aggregatedSignature).catch(_=>false)
    
            let rootPubIsEqualToReal = bls.aggregatePublicKeys([aggregatedPub,...afkVoters]) === global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB'+checkpointFullID)
    
            
            
            
            if(signaIsOk && majorityIsOk && rootPubIsEqualToReal){

                // Add request to sync function 
                tempObject.PROOFS_REQUESTS.set(blockID,{hash:blockHash,aggregatedCommitments:{aggregatedPub,aggregatedSignature,afkVoters}})
    
                blocksSet.push(blockID)

            }

        }


        MANY_FINALIZATION_PROOFS_POLLING(tempObject,blocksSet,response)
        

    }else !response.aborted && response.end(JSON.stringify({err:'Route is off or QT checkpoint is incomplete'}))

}),




/*

*********************************************************************
                                                                    *
Accept AGGREGATED_FINALIZATION_PROOF or send if it exists locally   *
                                                                    *
*********************************************************************


*/
acceptAggregatedFinalizationProof=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    let checkpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.payloadHash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.id

    let poolsMetadataOnQuorumThread = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.payload.poolsMetadata

    let tempObject = global.SYMBIOTE_META.TEMP.get(checkpointFullID)

    if(!tempObject){

        !response.aborted && response.end(JSON.stringify({err:'Checkpoint is not fresh'}))

        return
    }

    
   
    let possibleAggregatedFinalizationProof=await BODY(bytes,global.CONFIG.PAYLOAD_SIZE)

    let {blockID,blockHash,aggregatedPub,aggregatedSignature,afkVoters} = possibleAggregatedFinalizationProof
    
    if(typeof aggregatedPub !== 'string' || typeof aggregatedSignature !== 'string' || typeof blockID !== 'string' || typeof blockHash !== 'string' || !Array.isArray(afkVoters)){

        !response.aborted && response.end(JSON.stringify({err:'Wrong format of input params'}))

        return

    }

    let myLocalBlock = await global.SYMBIOTE_META.BLOCKS.get(blockID).catch(_=>false)

    let [blockCreator,_] = blockID.split(':')


    let hashesAreEqual = myLocalBlock ? Block.genHash(myLocalBlock) === blockHash : false

    let signaIsOk = await bls.singleVerify(blockID+blockHash+'FINALIZATION'+checkpointFullID,aggregatedPub,aggregatedSignature).catch(_=>false)

    let majorityIsOk = (global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.quorum.length-afkVoters.length) >= GET_MAJORITY('QUORUM_THREAD')
    
    let rootPubIsEqualToReal = bls.aggregatePublicKeys([aggregatedPub,...afkVoters]) === global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB'+checkpointFullID)
    
    let primePoolOrAtLeastReassignment = poolsMetadataOnQuorumThread[blockCreator] && (tempObject.REASSIGNMENTS.has(blockCreator) && poolsMetadataOnQuorumThread[blockCreator].isReserve || !poolsMetadataOnQuorumThread[blockCreator].isReserve)

    let checkpointTempDB = tempObject.DATABASE



    if(signaIsOk && majorityIsOk && rootPubIsEqualToReal && hashesAreEqual && primePoolOrAtLeastReassignment){

        await USE_TEMPORARY_DB('put',checkpointTempDB,'AFP:'+blockID,{blockID,blockHash,aggregatedPub,aggregatedSignature,afkVoters}).catch(_=>{})

        !response.aborted && response.end(JSON.stringify({status:'OK'}))

    }else !response.aborted && response.end(JSON.stringify({err:`Something wrong because all of 5 must be true => signa_is_ok:${signaIsOk} | majority_voted_for_it:${majorityIsOk} | quorum_root_pubkey_is_current:${rootPubIsEqualToReal} | hashesAreEqual:${hashesAreEqual} | primePoolOrAtLeastReassignment:${primePoolOrAtLeastReassignment}`}))


}),




/*

To return AGGREGATED_FINALIZATION_PROOF related to some block PubX:Index

Only in case when we have AGGREGATED_FINALIZATION_PROOF we can verify block with the 100% garantee that it's the part of valid subchain and will be included to checkpoint 

Params:

    [0] - blockID

Returns:

    {
        blockID,
        blockHash,
        aggregatedSignature:<>, // blockID+hash+'FINALIZATION'+QT.CHECKPOINT.HEADER.PAYLOAD_HASH+"#"+QT.CHECKPOINT.HEADER.ID
        aggregatedPub:<>,
        afkVoters
        
    }

*/
getAggregatedFinalizationProof=async(response,request)=>{

    response.onAborted(()=>response.aborted=true).writeHeader('Access-Control-Allow-Origin','*')


    if(global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.MAIN.GET_AGGREGATED_FINALIZATION_PROOFS){

        let checkpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.payloadHash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.id

        if(!global.SYMBIOTE_META.TEMP.has(checkpointFullID)){

            !response.aborted && response.end(JSON.stringify({err:'QT checkpoint is not ready'}))

            return
        }

        let blockID = request.getParameter(0)
       
        let aggregatedFinalizationProof = await USE_TEMPORARY_DB('get',global.SYMBIOTE_META.TEMP.get(checkpointFullID)?.DATABASE,'AFP:'+blockID).catch(_=>false)

        if(aggregatedFinalizationProof){

            !response.aborted && response.end(JSON.stringify(aggregatedFinalizationProof))

        }else !response.aborted && response.end(JSON.stringify({err:'No proof'}))

    }else !response.aborted && response.end(JSON.stringify({err:'Route is off'}))

},




/*

To return AFP(AGGREGATED_FINALIZATION_PROOF) related to the latest block we have 

Only in case when we have AFP we can verify block with the 100% garantee that it's the part of valid subchain and will be included to checkpoint 

Params:

Returns:

    {
        
        index, // height of block that we already finalized. Also, below you can see the AGGREGATED_FINALIZATION_PROOF. We need it as a quick proof that majority have voted for this segment of subchain
        
        hash:<>,

        aggregatedFinalizationProof:{
            
            aggregatedSignature:<>, // blockID+hash+'FINALIZATION'+QT.CHECKPOINT.HEADER.PAYLOAD_HASH+"#"+QT.CHECKPOINT.HEADER.ID
            aggregatedPub:<>,
            afkVoters
        
        }
    
    
    }

*/
healthChecker = async response => {

    response.onAborted(()=>response.aborted=true)

    if(global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.MAIN.HEALTH_CHECKER){

        // Get the latest AGGREGATED_FINALIZATION_PROOF that we have
        let appropriateDescriptor = global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('BLOCK_SENDER_HANDLER')

        if(!appropriateDescriptor) !response.aborted && response.end(JSON.stringify({err:`Still haven't start the procedure of grabbing finalization proofs`}))


        
        let latestFullyFinalizedHeight = appropriateDescriptor.height-1

        let blockID = global.CONFIG.SYMBIOTE.PUB+":"+latestFullyFinalizedHeight

        let block = await global.SYMBIOTE_META.BLOCKS.get(blockID).catch(_=>false)

        let latestHash = block && Block.genHash(block)

        let checkpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.payloadHash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.id

        if(!global.SYMBIOTE_META.TEMP.has(checkpointFullID)){

            !response.aborted && response.end(JSON.stringify({err:'QT checkpoint is not ready'}))

            return
        }
       

        let aggregatedFinalizationProof = await USE_TEMPORARY_DB('get',global.SYMBIOTE_META.TEMP.get(checkpointFullID)?.DATABASE,'AFP:'+blockID).catch(_=>false)


        if(aggregatedFinalizationProof){

            let healthProof = {index:latestFullyFinalizedHeight,hash:latestHash,aggregatedFinalizationProof}

            !response.aborted && response.end(JSON.stringify(healthProof))

        }else !response.aborted && response.end(JSON.stringify({err:'No proof'}))

    }else !response.aborted && response.end(JSON.stringify({err:'Route is off'}))

},




/*

To return the stats about the health about another pool

[Params]:

    0 - poolID

[Returns]:

    Our local stats about the health of provided pool

    {
        index,
        hash,

        aggregatedFinalizationProof:
            
            {

                (?) aggregatedPub,
                (?) aggregatedSignature:<>, // SIG(blockID+blockHash+'FINALIZATION'+checkpointFullID)
                (?) afkVoters
        
            }

        (?) - if index and hash are taken from checkpoint, it might be no aggregated proofs of finalization sent in response
        
    }


*/
anotherPoolHealthChecker = async(response,request) => {

    response.onAborted(()=>response.aborted=true)

    if(global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.MAIN.HEALTH_CHECKER){

        
        let requestedPoolPubKey = request.getParameter(0)

        let quorumThreadCheckpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.payloadHash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.id

        let tempObject = global.SYMBIOTE_META.TEMP.get(quorumThreadCheckpointFullID)

    
        if(!tempObject){
    
            !response.aborted && response.end(JSON.stringify({err:'QT checkpoint is not ready'}))
    
            return
        }


        // Get the stats from our HEALTH_CHECKER

        let healthHandler = tempObject.HEALTH_MONITORING.get(requestedPoolPubKey)

        if(healthHandler){

            !response.aborted && response.end(JSON.stringify(healthHandler))

        }else !response.aborted && response.end(JSON.stringify({err:'No health handler'}))


    }else !response.aborted && response.end(JSON.stringify({err:'Route is off'}))

},



// Function to return signature of skip proof if we have SKIP_HANDLER for requested subchain. Return the signature if requested INDEX >= than our own or send UPDATE message with FINALIZATION_PROOF 

/*


[Accept]:

    {

        poolPubKey,

        extendedAggregatedCommitments:{
            
            index,
            
            hash,

            aggregatedCommitments:{

                aggregatedPub,
                aggregatedSignature:<>, // SIG(blockID+blockHash+QT.CHECKPOINT.HEADER.PAYLOAD_HASH+"#"+QT.CHECKPOINT.HEADER.ID)
                afkVoters:[...]

            }

        }

    }


[Response]:


[1] In case we have skip handler for this pool in SKIP_HANDLERS and if <extendedAggregatedCommitments> in skip handler has <= index than in FP from request we can response:
        
        {
            type:'OK',
            sig: BLS_SIG('SKIP:<poolPubKey>:<index>:<hash>:<checkpointFullID>')
        }


[2] In case we have bigger index in <extendedAggregatedCommitments> - response with 'UPDATE' message:

    {
        type:'UPDATE',
                        
        <extendedAggregatedCommitments>:{
                            
            index,
            hash,
            aggregatedCommitments:{aggregatedPub,aggregatedSignature,afkVoters}
        
        }
                        
    }


*/
getSkipProof=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    let checkpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.payloadHash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.id

    let tempObject = global.SYMBIOTE_META.TEMP.get(checkpointFullID)

    if(!tempObject){

        !response.aborted && response.end(JSON.stringify({err:'Checkpoint is not fresh'}))

        return
    }


    let mySkipHandlers = tempObject.SKIP_HANDLERS

    let majority = GET_MAJORITY('QUORUM_THREAD')

    let reverseThreshold = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.quorum.length-majority

    let qtRootPub = global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB'+checkpointFullID)

    
    let requestForSkipProof=await BODY(bytes,global.CONFIG.PAYLOAD_SIZE)


    if(typeof requestForSkipProof === 'object' && mySkipHandlers.has(requestForSkipProof.poolPubKey) && typeof requestForSkipProof.extendedAggregatedCommitments){

        
        
        let {index,hash,aggregatedCommitments} = requestForSkipProof.extendedAggregatedCommitments

        let localSkipHandler = mySkipHandlers.get(requestForSkipProof.poolPubKey)



        // We can't sign the skip proof in case requested height is lower than our local version of aggregated commitments. So, send 'UPDATE' message
        if(localSkipHandler.extendedAggregatedCommitments.index > index){

            let responseData = {
                
                type:'UPDATE',

                extendedAggregatedCommitments:localSkipHandler.extendedAggregatedCommitments

            }

            !response.aborted && response.end(JSON.stringify(responseData))


        }else if(typeof aggregatedCommitments === 'object'){

            // Otherwise we can generate skip proof(signature) and return. But, anyway - check the <aggregatedCommitments> in request

            let {aggregatedPub,aggregatedSignature,afkVoters} = aggregatedCommitments
            
            let dataThatShouldBeSigned = requestForSkipProof.poolPubKey+':'+index+hash+checkpointFullID
            
            let aggregatedCommitmentsIsOk = await bls.verifyThresholdSignature(aggregatedPub,afkVoters,qtRootPub,dataThatShouldBeSigned,aggregatedSignature,reverseThreshold).catch(_=>false)

            // If signature is ok - generate skip proof

            if(aggregatedCommitmentsIsOk){

                let skipMessage = {
                    
                    type:'OK',

                    sig:await BLS_SIGN_DATA(`SKIP:${requestForSkipProof.poolPubKey}:${index}:${hash}:${checkpointFullID}`)
                }

                !response.aborted && response.end(JSON.stringify(skipMessage))

                
            }else !response.aborted && response.end(JSON.stringify({err:'Wrong signature'}))

             
        }else !response.aborted && response.end(JSON.stringify({err:'Wrong format'}))


    }else !response.aborted && response.end(JSON.stringify({err:'Wrong format'}))


}),



/*

[Info]: Once quorum member who already have ASP get the 2/3N+1 approvements for reassignment it can produce commitments, finalization proofs for the next reserve pool in (QT/VT).CHECKPOINT.REASSIGNMENT_CHAINS[<primePool>] and start to monitor health for this pool

[Accept]:

{
    poolPubKey:<pool BLS public key>,
    session:<64-bytes hex string>
}


[Response]:

If we also have an <aggregatedSkipProof> in our local SKIP_HANDLERS[<poolPubKey>] - we can vote for reassignment:

Response => {type:'OK',sig:SIG(`REASSIGNMENT:<poolPubKey>:<session>:<checkpointFullID>`)}

Otherwise => {type:'ERR'}

*/
getReassignmentReadyStatus=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    let checkpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.payloadHash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.id

    let tempObject = global.SYMBIOTE_META.TEMP.get(checkpointFullID)

    if(!tempObject){

        !response.aborted && response.end(JSON.stringify({err:'Checkpoint is not fresh'}))

        return
    }

    
    let reassignmentApprovementRequest = await BODY(bytes,global.CONFIG.PAYLOAD_SIZE)

    let skipHandler = tempObject.SKIP_HANDLERS.get(reassignmentApprovementRequest?.poolPubKey)


    if(skipHandler && skipHandler.aggregatedSkipProof && typeof reassignmentApprovementRequest.session === 'string' && reassignmentApprovementRequest.session.length === 64){

        let signatureToResponse = await BLS_SIGN_DATA(`REASSIGNMENT:${reassignmentApprovementRequest.poolPubKey}:${reassignmentApprovementRequest.session}:${checkpointFullID}`)

        !response.aborted && response.end(JSON.stringify({type:'OK',sig:signatureToResponse}))

    }else !response.aborted && response.end(JSON.stringify({type:'ERR'}))


}),



/*


[Info]:

    Route to ask for <aggregatedSkipProof>(s) in function TEMPORARY_REASSIGNMENTS_BUILDER()


[Accept]:

    Nothing


[Returns]:

Object like {

    primePool => {currentReservePoolIndex,firstBlockByCurrentAuthority,afpForFirstBlockByCurrentAuthority}

}

___________________________________________________________

[0] currentReservePoolIndex - index of current authority for subchain X. To get the pubkey of subchain authority - take the QUORUM_THREAD.CHECKPOINT.REASSIGNMENT_CHAINS[<primePool>][currentReservePoolIndex]

[1] firstBlockByCurrentAuthority - default block structure

[2] afpForFirstBlockByCurrentAuthority - default SFP structure -> 


    {
        
        blockID,
        blockHash,
        aggregatedSignature:<>, // blockID+hash+'FINALIZATION'+QT.CHECKPOINT.HEADER.PAYLOAD_HASH+"#"+QT.CHECKPOINT.HEADER.ID
        aggregatedPub:<>,
        afkVoters
        
    }


*/
getDataForTempReassignments = async response => {

    response.onAborted(()=>response.aborted=true)

    if(global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.MAIN.GET_DATA_FOR_TEMP_REASSIGN){

        let quorumThreadCheckpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.payloadHash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.id

        let tempObject = global.SYMBIOTE_META.TEMP.get(quorumThreadCheckpointFullID)

        if(!tempObject){
    
            !response.aborted && response.end(JSON.stringify({err:'QT checkpoint is not ready'}))
    
            return
        }

        // Get the current authorities for subchains from REASSIGNMENTS

        let currentPrimePools = Object.keys(global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.reassignmentChains) // [primePool0, primePool1, ...]

        let templateForResponse = {} // primePool => {currentReservePoolIndex,firstBlockByCurrentAuthority,afpForFirstBlockByCurrentAuthority}

        for(let primePool of currentPrimePools){

            // Get the current authority

            let reassignmentHandler = tempObject.REASSIGNMENTS.get(primePool) // primePool => {currentReservePool:<number>}

            if(reassignmentHandler){

                let currentReservePoolIndex = reassignmentHandler.currentReservePool

                let currentSubchainAuthority = currentReservePoolIndex === -1 ? primePool : global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.reassignmentChains[primePool][currentReservePoolIndex]

                // Now get the first block & SFP for it

                let indexOfLatestBlockInPreviousEpoch = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.payload.poolsMetadata[currentSubchainAuthority]?.index

                if(typeof indexOfLatestBlockInPreviousEpoch === 'number'){

                    let blockID = currentSubchainAuthority+":"+(indexOfLatestBlockInPreviousEpoch+1)

                    let firstBlockByCurrentAuthority = await global.SYMBIOTE_META.BLOCKS.get(blockID).catch(_=>false)

                    if(firstBlockByCurrentAuthority){

                        // Finally, find the SFP for this block

                        let afpForFirstBlockByCurrentAuthority = await USE_TEMPORARY_DB('get',tempObject.DATABASE,'AFP:'+blockID).catch(_=>false)

                        // Put to response

                        templateForResponse[primePool]={

                            currentReservePoolIndex,
                            
                            firstBlockByCurrentAuthority,
                            
                            afpForFirstBlockByCurrentAuthority
                            
                        }

                    }

                }

            }

        }

        // Finally, send the <templateForResponse> back

        !response.aborted && response.end(JSON.stringify(templateForResponse))


    }else !response.aborted && response.end(JSON.stringify({err:'Route is off'}))

},




/*

Accept checkpoints from other pools in quorum and returns own version as answer
! Check the trigger START_SHARING_CHECKPOINT

[Accept]:


{
    
    issuer:<BLS pubkey of checkpoint grabbing initiator>,

    prevCheckpointPayloadHash: global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.payloadHash,
    
    poolsMetadata: {
                
        '7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta': {index,hash,isReserve}

        /..other data
            
    },
    operations: GET_SPECIAL_OPERATIONS(),
    otherSymbiotes: {}
        
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

        We compare the proposition of index:hash for pools with own version in global.SYMBIOTE_META.CHECKPOINT_MANAGER (poolPubKey => {index,hash,aggregatedCommitments})

        If we have a bigger index - then we get the <aggregatedCommitments> from a local storage and send as a part of answer

        {
            metadataUpdate:[

                {
                    poolPubKey:<BLS pubkey of pool>
                    index:<index of block>,
                    hash:<>,
                    aggregatedCommitments

                },...

            ]
        
        }


*/
checkpointStage1Handler=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    let checkpointProposition = await BODY(bytes,global.CONFIG.MAX_PAYLOAD_SIZE)

    if(typeof checkpointProposition.issuer !== 'string' || typeof checkpointProposition.prevCheckpointPayloadHash !== 'string' || typeof checkpointProposition.poolsMetadata !== 'object' || !Array.isArray(checkpointProposition.operations)){

        !response.aborted && response.end(JSON.stringify({err:'Wrong input formats'}))

        return

    }

    let checkpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.payloadHash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.id

    let poolsMetadataInCurrentCheckpointOnQuorumThread = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.payload.poolsMetadata

    let tempObject = global.SYMBIOTE_META.TEMP.get(checkpointFullID)

    

    if(!global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.completed || !tempObject) {

        !response.aborted && response.end(JSON.stringify({err:'QT checkpoint is incomplete'}))

        return

    }

    if(!tempObject.PROOFS_RESPONSES.has('READY_FOR_CHECKPOINT')){

        !response.aborted && response.end(JSON.stringify({err:'This checkpoint is fresh or not ready for checkpoint'}))

        return

    }
    

    // [0] Check which operations we don't have locally in mempool - it's signal to exclude it from proposition
    
    let excludeSpecOperations = checkpointProposition.OPERATIONS.filter(
        
        operation => !specialOperationsMempool.has(operation.id) // Exclude operations which we don't have
       
    ).map(operation => operation.id)



    
    if(excludeSpecOperations.length !== 0){

        
        !response.aborted && response.end(JSON.stringify({excludeSpecOperations}))


    }else{

        // On this step we know that all of proposed operations were checked by us and present in local mempool.
        // Also, we know that all the mandatory STOP_VALIDATOR operations are in current version of payload


        
        // [1] Compare proposed POOLS_METADATA with local copy of global.SYMBIOTE_META.CHECKPOINT_MANAGER

        let metadataUpdate = []
        
        let wrongStatusPresent=false, poolWithWrongStatus

        let pools = Object.keys(checkpointProposition.POOLS_METADATA)

        let localCopyOfPools = Object.keys(poolsMetadataInCurrentCheckpointOnQuorumThread)

        if(pools.toString() !== localCopyOfPools.toString()){

            !response.aborted && response.end(JSON.stringify({err:`Pools set are not equal with my version of pools metadata since previous checkpoint ${global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.id} ### ${global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.payloadHash}`}))

            return

        }


        for(let poolPubKey of pools){

            let localVersion = tempObject.CHECKPOINT_MANAGER.get(poolPubKey)
            
            if(poolsMetadataInCurrentCheckpointOnQuorumThread[poolPubKey].isReserve !== checkpointProposition.POOLS_METADATA[poolPubKey].isReserve) {

                wrongStatusPresent = true

                poolWithWrongStatus = poolPubKey

                break

            }

            if(localVersion?.index > checkpointProposition.POOLS_METADATA[poolPubKey].index){

                // Send the <HEIGHT UPDATE> notification with the AGGREGATED_COMMITMENT

                let template = {
                    
                    poolPubKey,
                    index:localVersion.index,
                    hash:localVersion.hash,
                    aggregatedCommitments:localVersion.aggregatedCommitments

                }

                metadataUpdate.push(template)

            }

        }


        //___________________________________ SUMMARY - WHAT WE HAVE ON THIS STEP ___________________________________

        /* In metadataUpdate we have objects with the structure
        
            {
                poolPubKey:<BLS pubkey of pool>
                index:<index of >,
                hash:<>,
                aggregatedCommitments

            }

            If this array is empty - then we can sign the checkpoint proposition(hash of received <checkpointProposition>)
            Otherwise - send metadataUpdate

        */

        if(wrongStatusPresent){

            !response.aborted && response.end(JSON.stringify({err:`Wrong <isReserve> for pool ${poolWithWrongStatus}`}))

        }
        else if(metadataUpdate.length!==0){

            !response.aborted && response.end(JSON.stringify({metadataUpdate}))

        }else if(checkpointProposition.prevCheckpointPayloadHash === global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.payloadHash){

            let finalVersionToSign = {

                issuer:checkpointProposition.issuer,
                prevCheckpointPayloadHash:checkpointProposition.prevCheckpointPayloadHash,                
                poolsMetadata:checkpointProposition.poolsMetadata,
                operations:checkpointProposition.operations,
                otherSymbiotes:{}                        
            
            }

            let sig = await BLS_SIGN_DATA(BLAKE3(JSON.stringify(finalVersionToSign)))

            !response.aborted && response.end(JSON.stringify({sig}))

        }else !response.aborted && response.end(JSON.stringify({err:`Everything failed(wrongSkipStatusPresent:false | metadataUpdate.length!==0 | hashes not equal)`}))

    }

}),




/*

[Description]:

    Route for the second stage of checkpoint distribution

    [0] Here we accept the checkpoint's payload and a proof that majority has the same. Also, <issuerProof> is a BLS signature of proposer of this checkpoint. We need this signature to prevent spam

    [1] If payload with appropriate hash is already in our local db - then re-sign the same hash 

    [2] If no, after verification this signature, we store this payload by its hash (<PAYLOAD_HASH> => <PAYLOAD>) to global.SYMBIOTE_META.TEMP[<QT_PAYLOAD>]

    [3] After we store it - generate the signature SIG('STAGE_2'+PAYLOAD_HASH) and response with it

    This way, we prevent the spam and make sure that at least 2/3N+1 has stored the same payload related to appropriate checkpoint's header



[Accept]:


{
    checkpointFinalizationProof:{

        aggregatedPub:<2/3N+1 from QUORUM>,
        aggregatedSigna:<SIG(PAYLOAD_HASH)>,
        afkVoters:[]

    }

    issuerProof:SIG(issuer+payloadHash)

    checkpointPayload:{

        issuer:<BLS pubkey of checkpoint grabbing initiator>
            
        prevCheckpointPayloadHash: global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.payloadHash,
            
        poolsMetadata: {
                
            '7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta': {index,hash,isReserve}

            /..other data
            
        },
        operations: GET_SPECIAL_OPERATIONS(),
        otherSymbiotes: {}
        
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

    let checkpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.payloadHash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.id

    let tempObject = global.SYMBIOTE_META.TEMP.get(checkpointFullID)


    if(!global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.completed || !tempObject){

        !response.aborted && response.end(JSON.stringify({err:'QT checkpoint is incomplete'}))

        return

    }


    let checkpointProofsResponses = tempObject.PROOFS_RESPONSES

    let {checkpointFinalizationProof,checkpointPayload,issuerProof}=await BODY(bytes,global.CONFIG.MAX_PAYLOAD_SIZE)


    if(!checkpointProofsResponses.has('READY_FOR_CHECKPOINT')){

        !response.aborted && response.end(JSON.stringify({err:'This checkpoint is fresh or not ready for checkpoint'}))

        return

    }

    if(!checkpointFinalizationProof){

        !response.aborted && response.end(JSON.stringify({err:'No CHECKPOINT_FINALIZATION_PROOF in input data'}))

        return

    }


    let {aggregatedPub,aggregatedSignature,afkVoters} = checkpointFinalizationProof

    let payloadHash = BLAKE3(JSON.stringify(checkpointPayload))

    let checkpointTemporaryDB = tempObject.DATABASE



    let payloadIsAlreadyInDb = await USE_TEMPORARY_DB('get',checkpointTemporaryDB,payloadHash).catch(_=>false)

    let proposerAlreadyInDB = await USE_TEMPORARY_DB('get',checkpointTemporaryDB,'PROPOSER_'+checkpointPayload.issuer).catch(_=>false)
    


    if(payloadIsAlreadyInDb){

        let sig = await BLS_SIGN_DATA('STAGE_2'+payloadHash)

        !response.aborted && response.end(JSON.stringify({sig}))

    }else if(proposerAlreadyInDB){

        !response.aborted && response.end(JSON.stringify({err:`You've already sent a majority agreed payload for checkpoint`}))

    }
    else{

        let majority = GET_MAJORITY('QUORUM_THREAD')

        let reverseThreshold = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.quorum.length-majority

        //Verify 2 signatures

        let majorityHasSignedIt = await bls.verifyThresholdSignature(aggregatedPub,afkVoters,global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB'+checkpointFullID),payloadHash,aggregatedSignature,reverseThreshold).catch(error=>({error}))

        let issuerSignatureIsOk = await bls.singleVerify(checkpointPayload.issuer+payloadHash,checkpointPayload.issuer,issuerProof).catch(error=>({error}))



        if(issuerSignatureIsOk.error){

            !response.aborted && response.end(JSON.stringify({err:`Issuer signature is not ok => ${issuerSignatureIsOk.error}`}))

            return

        }

        if(majorityHasSignedIt.error){

            !response.aborted && response.end(JSON.stringify({err:`Majority signature is not ok => ${majorityHasSignedIt.error}`}))

            return

        }
        

        if(majorityHasSignedIt && issuerSignatureIsOk){

            // Store locally, mark that this issuer has already sent us a finalized version of checkpoint

            try{

                let atomicBatch = checkpointTemporaryDB.batch()

                atomicBatch.put('PROPOSER_'+checkpointPayload.issuer,true)
            
                atomicBatch.put(payloadHash,checkpointPayload)

                await atomicBatch.write()

                // Generate the signature for the second stage

                let sig = await BLS_SIGN_DATA('STAGE_2'+payloadHash)

                !response.aborted && response.end(JSON.stringify({sig}))

            }catch{

                !response.aborted && response.end(JSON.stringify({err:'Something wrong with batch'}))

            }
            
        }else !response.aborted && response.end(JSON.stringify({err:'Something wrong'}))

    }

}),




/*

To return payload of some checkpoint by it's hash

Params:

    [0] - payloadHash


Returns:

    {
        prevCheckpointPayloadHash: '',
        poolsMetadata: [Object],
        operations: [],
        otherSymbiotes: {}
    }

*/
getPayloadForCheckpoint=async(response,request)=>{

    response.onAborted(()=>response.aborted=true)

    if(global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.MAIN.PAYLOAD_FOR_CHECKPOINT){

        let checkpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.payloadHash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.id

        if(!global.SYMBIOTE_META.TEMP.has(checkpointFullID)){

            !response.aborted && response.end('QT checkpoint is not ready')
        
            return

        }

        let checkpointTemporaryDB = global.SYMBIOTE_META.TEMP.get(checkpointFullID).DATABASE

        let payloadHash = request.getParameter(0),

            checkpoint = await USE_TEMPORARY_DB('get',checkpointTemporaryDB,payloadHash).catch(_=>false) || await global.SYMBIOTE_META.CHECKPOINTS.get(payloadHash).then(headerAndPayload=>headerAndPayload.payload).catch(_=>false)

        if(checkpoint){

            !response.aborted && response.end(JSON.stringify(checkpoint))

        }else !response.aborted && response.end('No checkpoint')

    }else !response.aborted && response.end('Route is off')

},


/*

Body is


{
    
    type:<operation id> ===> STAKING_CONTRACT_CALL | SLASH_UNSTAKE | UPDATE_RUBICON , etc. See ../systemOperationsVerifiers.js
    
    payload:{}

}

    * Payload has different structure depending on type


*/

systemSyncOperationsVerifier=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    
    let systemSyncOperation = await BODY(bytes,global.CONFIG.MAX_PAYLOAD_SIZE)

    let checkpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.payloadHash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.id


    if(!global.SYMBIOTE_META.TEMP.has(checkpointFullID) || !global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.completed){

        !response.aborted && response.end(JSON.stringify({err:'QT checkpoint is not ready'}))

        return
    }


    if(!global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.MAIN.SYSTEM_SYNC_OPERATIONS){

        !response.aborted && response.end(JSON.stringify({err:`Route is off. This node don't accept system sync operations`}))

        return
    }

    //Verify and if OK - generate signature and return

    if(SYSTEM_SYNC_OPERATIONS_VERIFIERS[systemSyncOperation.type]){

        let possibleSystemSyncOperation = await SYSTEM_SYNC_OPERATIONS_VERIFIERS[systemSyncOperation.type](systemSyncOperation.payload,true,false).catch(error=>({isError:true,error})) // it's just verify without state changes

        if(possibleSystemSyncOperation?.isError){
            
            !response.aborted && response.end(JSON.stringify({err:`Verification failed. Reason => ${JSON.stringify(possibleSystemSyncOperation)}`}))

        }
        else if(possibleSystemSyncOperation){

            // Generate signature

            let signature = await BLS_SIGN_DATA(
                
                BLAKE3(JSON.stringify(possibleSystemSyncOperation)+checkpointFullID)
                
            )

            !response.aborted && response.end(JSON.stringify({

                signer:global.CONFIG.SYMBIOTE.PUB,
                
                signature

            }))
       
        }
        else !response.aborted && response.end(`Verification failed.Check your input data carefully. The returned object from function => ${JSON.stringify(possibleSystemSyncOperation)}`)

    }else !response.aborted && response.end(`No verification function for this system sync operation => ${systemSyncOperation.type}`)

}),




// To accept system sync operation, verify that majority from quorum agree with it and add to mempool

/*


    {
        aggreementProof:{

            aggregatedPub:<Base58 encoded BLS pubkey>,
            aggregatedSignature:BLS_SIGNATURE(
                
                BLAKE3( JSON(systemSyncOperation) + checkpointFullID)
                
            ),
            afkVoters:[]

        }

        systemSyncOperation:{<your operation here>}

    }




Returns object like:

    [If verification is OK and system sync operation was added to mempool]:

        {status:'OK'}

    [Else]:

        {err:''}



*/
systemSyncOperationToMempool=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{


    let systemSyncOperationWithAgreementProof = await BODY(bytes,global.CONFIG.MAX_PAYLOAD_SIZE)

    let checkpointFullID = global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.payloadHash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.header.id


    if(!global.SYMBIOTE_META.TEMP.has(checkpointFullID) || !global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.completed){

        !response.aborted && response.end(JSON.stringify({err:'QT checkpoint is not ready'}))

        return
    }

    
    let tempObject = global.SYMBIOTE_META.TEMP.get(checkpointFullID)


    if(!global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.MAIN.SYSTEM_SYNC_OPERATIONS){

        !response.aborted && response.end(JSON.stringify({err:`Route is off. This node don't accept system sync operations`}))

        return
    }


    if(typeof systemSyncOperationWithAgreementProof.systemSyncOperation !== 'object' || typeof systemSyncOperationWithAgreementProof.aggreementProof !== 'object'){

        !response.aborted && response.end(JSON.stringify({err:`Wrong format. Input data must contain <systemSyncOperation>(your operation) and <agreementProof>(aggregated version of verification proofs from quorum members majority)`}))

        return

    }

    // Verify agreement and if OK - add to mempool

    let hashOfCheckpointFullIDAndOperation = BLAKE3(

        JSON.stringify(systemSyncOperationWithAgreementProof.systemSyncOperation) + checkpointFullID

    )

    let {aggregatedPub,aggregatedSignature,afkVoters} = systemSyncOperationWithAgreementProof.aggreementProof

    let signaIsOk = await bls.singleVerify(hashOfCheckpointFullIDAndOperation,aggregatedPub,aggregatedSignature).catch(_=>false)

    let majorityIsOk = (global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.quorum.length-afkVoters.length) >= GET_MAJORITY('QUORUM_THREAD')
    
    let rootPubIsEqualToReal = bls.aggregatePublicKeys([aggregatedPub,...afkVoters]) === global.SYMBIOTE_META.STATIC_STUFF_CACHE.get('QT_ROOTPUB'+checkpointFullID)


    if(signaIsOk && majorityIsOk && rootPubIsEqualToReal){

        // Add to mempool
        
        tempObject.SYSTEM_SYNC_OPERATIONS_MEMPOOL.push(systemSyncOperationWithAgreementProof.systemSyncOperation)

        !response.aborted && response.end(JSON.stringify({status:`OK`}))


    }else{

        !response.aborted && response.end(JSON.stringify({err:`Verification failed => {signaIsOk:${signaIsOk},majorityIsOk:${majorityIsOk},rootPubIsEqualToReal:${rootPubIsEqualToReal}}`}))

    }

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
    
    let acceptedData = await BODY(bytes,global.CONFIG.PAYLOAD_SIZE)

    if(!Array.isArray(acceptedData)){

        !response.aborted && response.end('Input must be a 2-elements array like [symbioteID,you_endpoint]')
        
        return

    }

    let [symbioteID,domain]=acceptedData
   
    if(global.GENESIS.SYMBIOTE_ID!==symbioteID){

        !response.aborted && response.end('Symbiotic chain not supported')
        
        return

    }

    if(!global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.MAIN.NEW_NODES){

        !response.aborted && response.end('Route is off')
        
        return
    }
    
    if(typeof domain==='string' && domain.length<=256){
        
        //Add more advanced logic in future(or use plugins - it's even better)
        let nodes=global.SYMBIOTE_META.PEERS
        
        if(!(nodes.includes(domain) || global.CONFIG.SYMBIOTE.BOOTSTRAP_NODES.includes(domain))){
            
            nodes.length<global.CONFIG.SYMBIOTE.MAX_CONNECTIONS
            ?
            nodes.push(domain)
            :
            nodes[~~(Math.random() * nodes.length)]=domain//if no place-paste instead of random node
    
            !response.aborted && response.end('Your node has been added')
    
        }else !response.aborted && response.end('Your node already in scope')
    
    }else !response.aborted && response.end('Wrong types => endpoint(domain) must be 256 chars in length or less')

})








UWS_SERVER


//_______________________________ Consensus related routes _______________________________


//1st stage - accept block and response with the commitment
.post('/block',acceptBlocks)

//2nd stage - accept aggregated commitments and response with the FINALIZATION_PROOF
.post('/finalization',finalization)

//3rd stage - logic with super finalization proofs. Accept AGGREGATED_FINALIZATION_PROOF(aggregated 2/3N+1 FINALIZATION_PROOFs from QUORUM members)
.post('/aggregated_finalization_proof',acceptAggregatedFinalizationProof)

.get('/aggregated_finalization_proof/:BLOCK_ID',getAggregatedFinalizationProof)


//_______________________________ Routes for checkpoint _______________________________


// // To sign the checkpoints' payloads
// .post('/checkpoint_stage_1',checkpointStage1Handler)

// // To confirm the checkpoints' payloads. Only after grabbing this signatures we can publish it to hostchain
// .post('/checkpoint_stage_2',checkpointStage2Handler)

// .get('/payload_for_checkpoint/:PAYLOAD_HASH',getPayloadForCheckpoint)


//________________________________ Health monitoring __________________________________


.get('/health',healthChecker)

.get('/get_health_of_another_pool/:POOL',anotherPoolHealthChecker)


//______________________ Routes related to the skip procedure _________________________


// Function to return signature of skip proof if we have SKIP_HANDLER for requested pool. Return the signature if requested INDEX >= than our own or send UPDATE message with AGGREGATED_COMMITMENTS 
.post('/get_skip_proof',getSkipProof)

// Function to accept ASP(aggregatedSkipProof) (2/3N+1 of signatures received from route /get_skip_proof). Once quorum member receve it - it can start ping quorum members to get 2/3N+1 approvements about reassignment
// .post('/accept_aggregated_skip_proof',acceptAggregatedSkipProof)

// Once quorum member who already have ASP get the 2/3N+1 approvements for reassignment it can produce commitments, finalization proofs for the next reserve pool in (QT/VT).CHECKPOINT.reassignmentChains[<primePool>] and start to monitor health for this pool
.post('/get_reassignment_ready_status',getReassignmentReadyStatus)


// We need this route for function TEMPORARY_REASSIGNMENTS_BUILDER() to build temporary reassignments. This function just return the ASP for some pools(if ASP exists locally)
.get('/get_data_for_temp_reassign',getDataForTempReassignments)


//___________________________________ Other ___________________________________________


.post('/sign_system_sync_operation',systemSyncOperationsVerifier)

.post('/system_sync_operation_to_mempool',systemSyncOperationToMempool)

.post('/transaction',acceptTransactions)

.post('/addpeer',addPeer)