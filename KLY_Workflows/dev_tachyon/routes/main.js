import{BODY,SAFE_ADD,PARSE_JSON,BLAKE3} from '../../../KLY_Utils/utils.js'

import bls from '../../../KLY_Utils/signatures/multisig/bls.js'

import OPERATIONS_VERIFIERS from '../operationsVerifiers.js'

import {BROADCAST,VERIFY,SIG,BLOCKLOG} from '../utils.js'

import Block from '../essences/block.js'




let

//__________________________________________________________BASIC FUNCTIONAL_____________________________________________________________________



/******
 * ## Accept blocks
 * 
 * ### Body format
 * 
 * {
 *      creator:'7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta',
 *      time:1666744452126,
 *      events:[
 *          event1,
 *          event2,
 *          event3,
 *      ]
 *      index:1337,
 *      prevHash:'0123456701234567012345670123456701234567012345670123456701234567',
 *      sig:'jXO7fLynU9nvN6Hok8r9lVXdFmjF5eye09t+aQsu+C/wyTWtqwHhPwHq/Nl0AgXDDbqDfhVmeJRKV85oSEDrMjVJFWxXVIQbNBhA7AZjQNn7UmTI75WAYNeQiyv4+R4S'
 * }
 * 
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
            
                let block=await PARSE_JSON(buffer), hash=Block.genHash(block.creator,block.time,block.events,block.index,block.prevHash)
                
                //No sense to verify & accept own block
                if(block.creator===CONFIG.SYMBIOTE.PUB || SYMBIOTE_META.COMMITMENTS.get(block.сreator+":"+block.index+'/'+hash) || block.index<SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[block.creator]?.INDEX){

                    !response.aborted && response.end('OK')

                    return
                
                }
                
                //Check if we can accept this block
                
                let allow=
            
                    typeof block.events==='object' && typeof block.index==='number' && typeof block.prevHash==='string' && typeof block.sig==='string'//make general lightweight overview
                    &&
                    SYMBIOTE_META.VERIFICATION_THREAD.VALIDATORS_METADATA[block.creator]?.INDEX+CONFIG.SYMBIOTE.BLOCK_ACCEPTION_NORMAL_DIFFERENCE>block.index //check if block index is not too far from verification thread
                    &&
                    await VERIFY(hash,block.sig,block.creator)//and finally-the most CPU intensive task
                    &&
                    await SYMBIOTE_META.BLOCKS.get(block.creator+":"+block.index-1).then(prevBlock=>{

                        //Compare hashes to make sure it's a chain

                        let prevHash = Block.genHash(prevBlock.creator,prevBlock.time,prevBlock.events,prevBlock.index,prevBlock.prevHash)

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

                   !response.aborted && response.end('OK')

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




//____________________________________________________________CONSENSUS STUFF__________________________________________________________________


/*

*************************************************************
                                                            *
To accept signatures of blocks from validators in quorum    *
                                                            *
*************************************************************


Here we receive the object with validator's pubkey and his array of commitments

{
    validator:<PUBKEY>,
    payload:[
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

    O:<Origin -> the signature by block's creator to make sure that creator indeed created it's block>
    
    S:<Signature => SIG(BLOCK_ID+HASH)>
        
}

To verify that ValidatorX has received and confirmed block BLOCK_ID from ValidatorY we check

VERIFY(BLOCK_ID+HASH,Signature,Validator's pubkey)


***********************************************************************************

We put these commitments to local mapping SYMBIOTE_META.COMMITMENTS. The key is blockID/HASH and value is mapping like this

{
    "<VALIDATOR-WHO-CREATE-COMMITMENT>":"<HIS_BLS_SIGNATURE>"
}

Once we notice that inner mapping size is 2/3N+1 where N is quorum size, we can create FINALIZATION_PROOF,aggregate these values and flush mapping

More info about FINALIZATION_PROOF available in description to POST /finalization


*/

postCommitments=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    
    let commitmentsSet=await BODY(bytes,CONFIG.MAX_PAYLOAD_SIZE)


    if(CONFIG.SYMBIOTE.TRIGGERS.ACCEPT_COMMITMENTS && SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM.includes(commitmentsSet.validator)){

        // !response.aborted && response.end('OK')

        //Go through the set of commitments
        for(let singleCommitment of commitmentsSet.payload){

            
            let signaturesIsOk =    await VERIFY(singleCommitment.B+singleCommitment.H,singleCommitment.S,commitmentsSet.validator)
            
                                    &&
                                
                                    await VERIFY(singleCommitment.H,singleCommitment.O,singleCommitment.B.split(':')[0])


            
            if(signaturesIsOk){

                //Check if appropriate pool exist(related to blockID and hash)
                let poolID = singleCommitment.B+"/"+singleCommitment.H

                if(!SYMBIOTE_META.COMMITMENTS.has(poolID)) {

                    if(SYMBIOTE_META.COMMITMENTS.size>=CONFIG.SYMBIOTE.COMMITMENTS_POOL_LIMIT) return

                    SYMBIOTE_META.COMMITMENTS.set(poolID,new Map())

                }

                let mapping = SYMBIOTE_META.COMMITMENTS.get(poolID)

                mapping.set(commitmentsSet.validator,singleCommitment.S)


                let quorumSize = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM.length,
                
                    majority = Math.floor(quorumSize*(2/3)+1)

                majority = majority > quorumSize ? quorumSize : majority
            
                let majorityNumberOfCommitments = mapping.size >= majority

                if(majorityNumberOfCommitments){

                    //If we have more than 2/3N+1 commitments - we can generate FINALIZATION_PROOF

                    let finalizationProofSignature = await SIG(singleCommitment.B+singleCommitment.H+"FINALIZATION")

                    if(!SYMBIOTE_META.FINALIZATION_PROOFS.has(poolID)) SYMBIOTE_META.FINALIZATION_PROOFS.set(poolID,new Map([[CONFIG.SYMBIOTE.PUB,finalizationProofSignature]]))

                    //Flush commitments because no more sense to store it when we have FINALIZATION_PROOF
                    SYMBIOTE_META.COMMITMENTS.delete(poolID)
    
                }

            }
        
        }
        
        !response.aborted&&response.end('OK')

    }else !response.aborted&&response.end('Route is off')
    

}),


/*

To return own commitment by blockID:Hash

We return single signature where sign => SIG(blockID+hash)

Params:

    [0] - blockID:Hash

Returns:

    SIG(blockID+hash)

*/
getCommitment=async(response,request)=>{

    response.onAborted(()=>response.aborted=true)

    if(SYMBIOTE_META.START_CHECKPOINT_CREATION_PROCESS){

        response.end('Checkpoint creating process has been started')

        return

    }

    if(CONFIG.SYMBIOTE.TRIGGERS.GET_COMMITMENTS){

        let [blockCreator,index,hash] = request.getParameter(0)?.split(':'), commitmentsPool = SYMBIOTE_META.COMMITMENTS.get(blockCreator+':'+index+'/'+hash)

        if(commitmentsPool.has(CONFIG.SYMBIOTE.PUB)){

            response.end(commitmentsPool.get(CONFIG.SYMBIOTE.PUB))

        }else if(CONFIG.SYMBIOTE.RESPONSIBILITY_ZONES.COMMITMENTS.ALL || CONFIG.SYMBIOTE.RESPONSIBILITY_ZONES.COMMITMENTS[blockCreator]){

            let block = await SYMBIOTE_META.BLOCKS.get(blockCreator+':'+index).catch(_=>false)

            if(block){

                let blockHash = Block.genHash(block.creator,block.time,block.events,block.index,block.prevHash)

                if(blockHash===hash){

                    //Generete commitment

                    let commitmentSig = await SIG(blockCreator+':'+index+hash)
                    
                    SYMBIOTE_META.COMMITMENTS.set(blockCreator+':'+index+'/'+hash,new Map([[CONFIG.SYMBIOTE.PUB,commitmentSig]]))

                    response.end(commitmentSig)

                }else response.end('Hash mismatch')

            }else response.end('Block not found')

        }else response.end('Not my responsibility zone')

    }else response.end('Route is off')

},




/*


*****************************************************
                                                    * 
Accept FINALIZATION_PROOF from other quorum members *
                                                    *
*****************************************************


We get FINALIZATION_PROOF from SYMBIOTE_META.FINALIZATION_PROOF mapping. We fullfilled this mapping inside POST /commitment mapping when some block PubX:Y:H(height=Y,creator=PubX,hash=H)
receive 2/3N+1 commitments

Structure of FINALIZATION_PROOF

{

    blockID:"7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta:0",

    hash:"0123456701234567012345670123456701234567012345670123456701234567",
    
    validator:"7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta", //creator of FINALIZATION_PROOF

    finalizationSigna:SIG(blockID+hash+"FINALIZATION")

}

*****************************************************

To verify FINALIZATION_PROOF from some ValidatorX we need to do this steps:

1)Verify the finalization signa

    VERIFY(blockID+hash+"FINALIZATION",finalization_signa,Validator)


If verification is ok, add this FINALIZATION_PROOF to cache mapping SYMBIOTE_META.FINALIZATON_PROOFS

Key is blockID/Hash and value is inner mapping like this:

{
    "<VALIDATOR-WHO-CREATE-FINALIZATION-PROOF>":"<finalization_signa>"
}

*****************************************************

Also, when we notice that there are 2/3N+1 mapping size, we can aggregate it and create SUPER_FINALIZATION_PROOF.After that, we can clear these FINALIZATION_PROOFS from SYMBIOTE_META.FINALIZATON_PROOFS

More detailed about it in description to the next route



*/

postFinalization=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    let finalizationProof=await BODY(bytes,CONFIG.MAX_PAYLOAD_SIZE)

    if(CONFIG.SYMBIOTE.TRIGGERS.ACCEPT_FINALIZATION_PROOFS && SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM.includes(finalizationProof.validator)){

        !response.aborted && response.end('OK')

        let signatureIsOk = await VERIFY(finalizationProof.blockID+finalizationProof.hash+"FINALIZATION",finalizationProof.finalizationSigna,finalizationProof.validator)

        if(signatureIsOk){

            //Check if appropriate pool exist(related to blockID and hash)
            let poolID = finalizationProof.blockID+"/"+finalizationProof.hash

            if(!SYMBIOTE_META.FINALIZATION_PROOFS.has(poolID)) {

                if(SYMBIOTE_META.FINALIZATION_PROOFS.size>=CONFIG.SYMBIOTE.FINALIZATION_PROOFS_POOL_LIMIT) return

                SYMBIOTE_META.FINALIZATION_PROOFS.set(poolID,new Map())

            }

            let mapping = SYMBIOTE_META.FINALIZATION_PROOFS.get(poolID)

            mapping.set(finalizationProof.validator,finalizationProof.finalizationSigna)

            
            let quorumSize = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM.length, 
            
                majority = Math.floor(quorumSize*(2/3)+1)

            majority = majority > quorumSize ? quorumSize : majority
            
            let majorityVotedForFinalization = mapping.size >= majority


            //If more than 2/3N+1 finalization proofs exists - we can aggregate them to build SUPER_FINALIZATION_PROOF
            if(majorityVotedForFinalization){

                let pubkeys=[], signatures=[], afkValidators = []

                SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM.forEach(pubKey=>{

                    if(mapping.has(pubKey)){

                        pubkeys.push(pubKey)
                    
                        signatures.push(signa)

                    }else afkValidators.push(pubKey)

                })

                let superFinalizationProof={

                    aggregatedPub:bls.aggregatePublicKeys(pubkeys),

                    aggregatedSignature:bls.aggregateSignatures(signatures),

                    afkValidators

                }

                //Add SUPER_FINALIZATION_PROOF to cache
                SYMBIOTE_META.SUPER_FINALIZATION_PROOFS.set(poolID,superFinalizationProof)

                //...and delete appropriate pool from FINALIZATION_PROOFS because lack of sense in it when we already have SUPER_FINALIZATION_PROOF
                SYMBIOTE_META.FINALIZATION_PROOFS.delete(poolID)


            }

        }

    }else !response.aborted&&response.end('Route is off')


}),



//Returns only own FINALIZATION_PROOF
//Will be returned single signature where CONFIG.SYMBIOTE.PUB signed SIG(blockID+"FINALIZATION")
getFinalization=async(response,request)=>{

    response.onAborted(()=>response.aborted=true)

    if(CONFIG.SYMBIOTE.TRIGGERS.GET_FINALIZATION_PROOFS){

        let [blockCreator,index,hash] = request.getParameter(0)?.split(':'), proofsPool = SYMBIOTE_META.FINALIZATION_PROOFS.get(blockCreator+':'+index+'/'+hash)

        if(proofsPool){

            response.end(proofsPool.get(CONFIG.SYMBIOTE.PUB))

        }else response.end('No such pool')

    }else response.end('Route is off')

},




/*

****************************************************************
                                                               *
Accept SUPER_FINALIZATION_PROOF or send if it exists locally   *
                                                               *
****************************************************************

    Latest bastion. This POST /super_finalization route share SUPER_FINALIZATION_PROOF from SYMBIOTE_META.SUPER_FINALIZATION_PROOFS

    If we have SUPER_FINZALIZATION_PROOF - response with it

    If the incoming payload is SUPER_FINZALIZATION_PROOF - then verify it and if OK,
        
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


3) Make sure that it's majority solution by checking QUORUM_SIZE-afkValidators >= 2/3N+1

*/
postSuperFinalization=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    let superFinalizationProof=await BODY(bytes,CONFIG.MAX_PAYLOAD_SIZE)

    //Check if appropriate pool exist(related to blockID and hash)
    let poolID = superFinalizationProof.blockID+"/"+superFinalizationProof.hash

    if(SYMBIOTE_META.SUPER_FINALIZATION_PROOFS.has(poolID)){

        response.end('SUPER_FINALIZATION_PROOF already exists')

        return

    } 
    
    else if(SYMBIOTE_META.SUPER_FINALIZATION_PROOFS.size>=CONFIG.SYMBIOTE.SUPER_FINALIZATION_PROOFS_POOL_LIMIT) !response.aborted&&response.end('Too many pools')
    
    else if(CONFIG.SYMBIOTE.TRIGGERS.ACCEPT_SUPER_FINALIZATION_PROOFS){

        !response.aborted&&response.end('OK')
    
        let aggregatedSignatureIsOk = await VERIFY(superFinalizationProof.blockID+superFinalizationProof.hash+"FINALIZATION",superFinalizationProof.aggregatedSigna,superFinalizationProof.aggregatedPub),

            rootQuorumKeyIsEqualToProposed = SYMBIOTE_META.STUFF_CACHE.get('QUORUM_AGGREGATED_PUB') === bls.aggregatePublicKeys([superFinalizationProof.aggregatedPub,...superFinalizationProof.afkValidators]),

            quorumSize = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.QUORUM.length,

            majority = Math.floor(quorumSize*(2/3)+1)

        majority = majority > quorumSize ? quorumSize : majority

        let majorityVotedForFinalization = quorumSize-superFinalizationProof.afkValidators.length >= majority


        if(aggregatedSignatureIsOk && rootQuorumKeyIsEqualToProposed && majorityVotedForFinalization){

            SYMBIOTE_META.SUPER_FINALIZATION_PROOFS.set(poolID,{

                aggregatedPub:superFinalizationProof.aggregatedPub,

                aggregatedSigna:superFinalizationProof.aggregatedSignature,
            
                afkValidators:superFinalizationProof.afkValidators

            })

            //And delete pool with the finalization proofs from other quorum members because we don't need it anymore
            SYMBIOTE_META.FINALIZATION_PROOFS.delete(poolID)

        }
        
    }else !response.aborted&&response.end('Route is off')

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

        let [blockCreator,index,hash] = request.getParameter(0)?.split(':'),

            superProof = SYMBIOTE_META.SUPER_FINALIZATION_PROOFS.has(blockCreator+':'+index+'/'+hash)

        if(superProof){

            response.end(JSON.stringify(superProof))

        }else response.end('No proof')

    }else response.end('Route is off')

},




/*

Accept checkpoints from other validators in quorum and returns own version as answer
! Check the trigger START_SHARING_CHECKPOINT


Body format:{



}


Response:{



}

*/
checkpoint=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    let checkpointProposition=await BODY(bytes,CONFIG.MAX_PAYLOAD_SIZE)

}),




/*

To return payload of some checkpoint by hash

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

operationsAccept=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    let operation=await BODY(bytes,CONFIG.MAX_PAYLOAD_SIZE)


    //Verify and if OK - put to SPECIAL_OPERATIONS_MEMPOOL
    if(CONFIG.SYMBIOTE.TRIGGERS.OPERATIONS_ACCEPT && SYMBIOTE_META.SPECIAL_OPERATIONS_MEMPOOL.length<CONFIG.SYMBIOTE.SPECIAL_OPERATIONS_MEMPOOL_SIZE && OPERATIONS_VERIFIERS[operation.type]){

        let isOk = await OPERATIONS_VERIFIERS[operation.type](operation.payload,true,false) //it's just verify without state changes

        if(isOk){

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



//1st stage - logic with commitments
.get('/get_commitments/:BLOCK_ID_WITH_HASH',getCommitment)

.post('/commitments',postCommitments)


//2nd stage - logic with finalization
.get('/get_finalization/:BLOCK_ID_WITH_HASH',getFinalization)

.post('/finalization',postFinalization)


//3rd stage - logic with super finalization proofs
.get('/get_super_finalization/:BLOCK_ID_WITH_HASH',getSuperFinalization)

.post('/super_finalization',postSuperFinalization)


.get('/get_payload_for_checkpoint/:CHECKPOINT_ID',getPayloadForCheckpoint)


.post('/operations',operationsAccept)


.post('/checkpoint',checkpoint)

.post('/block',acceptBlocks)

.post('/event',acceptEvents)

.post('/addpeer',addPeer)