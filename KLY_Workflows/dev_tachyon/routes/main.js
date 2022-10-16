import{BODY,SAFE_ADD,PARSE_JSON,BLAKE3} from '../../../KLY_Utils/utils.js'

import bls from '../../../KLY_Utils/signatures/multisig/bls.js'

import {BROADCAST,VERIFY,SIG,BLOCKLOG} from '../utils.js'

import MESSAGE_VERIFIERS from '../messagesVerifiers.js'

import Block from '../essences/block.js'

import Base58 from 'base-58'


let

//__________________________________________________________BASIC FUNCTIONAL_____________________________________________________________________




acceptBlocks=response=>{
    
    let total=0,buf=Buffer.alloc(0)
    
    //Check if we should accept this block.NOTE-use this option only in case if you want to stop accept blocks or override this process via custom runtime scripts or external services
    if(!CONFIG.SYMBIOTE.TRIGGERS.ACCEPT_BLOCKS){
        
        !response.aborted && response.end('Route is off')
        
        return
    
    }
    
    response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async(chunk,last)=>{

        if(total+chunk.byteLength<=CONFIG.MAX_PAYLOAD_SIZE){
        
            buf=await SAFE_ADD(buf,chunk,response)//build full data from chunks
    
            total+=chunk.byteLength
        
            if(last){
            
                let block=await PARSE_JSON(buf), hash=Block.genHash(block.creator,block.time,block.events,block.index,block.prevHash)
                
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

                   !response.aborted&&response.end('OK')

                }else !response.aborted&&response.end('Overview failed')
            
            }
        
        }else !response.aborted&&response.end('Payload limit')
    
    })

},
  
    


//Format of body : {symbiote,body}
//There is no 'c'(creator) field-we get it from tx
acceptEvents=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async v=>{

    let {symbiote,event}=await BODY(v,CONFIG.PAYLOAD_SIZE)
    
    //Reject all txs if route is off and other guards methods
    if(!(CONFIG.SYMBIOTE.SYMBIOTE_ID===symbiote&&CONFIG.SYMBIOTE.TRIGGERS.ACCEPT_EVENTS) || typeof event?.c!=='string' || typeof event.n!=='number' || typeof event.s!=='string'){
        
        !response.aborted&&response.end('Overview failed')
        
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

            !response.aborted&&response.end('OK')

            SYMBIOTE_META.MEMPOOL.push(event)
                        
        }else !response.aborted&&response.end('Post overview failed')

    }else !response.aborted&&response.end('Mempool is fullfilled or no such filter')

}),




//Function to allow validator to back to the game
//Accept simple signed message from "offline"(who has ACTIVE:false in metadata) validator to make his active again
awakeRequestMessageHandler=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async v=>{
    
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

        !response.aborted&&response.end(JSON.stringify({P:CONFIG.SYMBIOTE.PUB,S:myAgreement}))
    
    }else !response.aborted&&response.end('Overview failed')

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

postCommitments=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async v=>{

    
    let commitmentsSet=await BODY(v,CONFIG.MAX_PAYLOAD_SIZE)


    if(CONFIG.SYMBIOTE.TRIGGERS.ACCEPT_COMMITMENTS && SYMBIOTE_META.VERIFICATION_THREAD.QUORUM.includes(commitmentsSet.validator)){

        !response.aborted&&response.end('OK')

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


                let majority = Math.floor(SYMBIOTE_META.QUORUM.length*(2/3)+1), majorityNumberOfCommitments = SYMBIOTE_META.QUORUM.length-mapping.size >= majority

                if(majorityNumberOfCommitments){

                    //If we have more than 2/3N+1 commitments - we can generate FINALIZATION_PROOF

                    let finalizationProofSignature = await SIG(singleCommitment.B+singleCommitment.H+"FINALIZATION")

                    if(!SYMBIOTE_META.FINALIZATION_PROOFS.has(poolID)) SYMBIOTE_META.FINALIZATION_PROOFS.set(poolID,new Map([CONFIG.SYMBIOTE.PUB,finalizationProofSignature]))

                    //Flush commitments because no more sense to store it when we have FINALIZATION_PROOF
                    SYMBIOTE_META.COMMITMENTS.delete(poolID)
    
                }

            }
        
        }
        
        
        !response.aborted&&response.end('OK')


    }else !response.aborted&&response.end('Route is off')
    

}),


/*

Return own commitment by blockID:Hash

0 - blockID:Hash

*/
getCommitment=async(response,request)=>{

    if(CONFIG.SYMBIOTE.TRIGGERS.GET_COMMITMENTS){

        let [blockCreator,index,hash] = request.getParameter(0)?.split(':'), commitmentsPoolExists = SYMBIOTE_META.COMMITMENTS.get(blockCreator+':'+index+'/'+hash)

        if(commitmentsPoolExists.has(CONFIG.SYMBIOTE.PUB)){

            response.end(commitmentsPoolExists.get(CONFIG.SYMBIOTE.PUB))

        }else if(CONFIG.SYMBIOTE.RESPONSIBILITY_ZONES.COMMITMENTS.ALL || CONFIG.SYMBIOTE.RESPONSIBILITY_ZONES.COMMITMENTS[blockCreator]){

            let block = await SYMBIOTE_META.BLOCKS.get(blockCreator+':'+index).catch(e=>false)

            if(block){

                let blockHash = Block.genHash(block.creator,block.time,block.events,block.index,block.prevHash)

                if(blockHash===hash){

                    //Generete commitment

                    let commitmentSig = await SIG(blockCreator+':'+index+hash)
                    
                    SYMBIOTE_META.COMMITMENTS.set(blockCreator+':'+index+'/'+hash,new Map([CONFIG.SYMBIOTE.PUB,commitmentSig]))

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

postFinalization=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async v=>{

    let finalizationProof=await BODY(v,CONFIG.MAX_PAYLOAD_SIZE)

    if(CONFIG.SYMBIOTE.TRIGGERS.ACCEPT_FINALIZATION_PROOFS && SYMBIOTE_META.VERIFICATION_THREAD.QUORUM.includes(finalizationProof.validator)){

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

            
            let majority = Math.floor(SYMBIOTE_META.QUORUM.length*(2/3)+1), majorityVotedForFinalization = SYMBIOTE_META.QUORUM.length-mapping.size >= majority


            //If more than 2/3N+1 finalization proofs exists - we can aggregate them to build SUPER_FINALIZATION_PROOF
            if(majorityVotedForFinalization){

                let pubkeys=[], signatures=[], afkValidators = []

                SYMBIOTE_META.QUORUM.forEach(pubKey=>{

                    if(mapping.has(pubKey)){

                        pubkeys.push(Base58.decode(pubKey))
                    
                        signatures.push(Buffer.from(signa,'base64'))

                    }else afkValidators.push(pubKey)

                })

                let superFinalizationProof={

                    aggregatedPub:Base58.encode(await bls.aggregatePublicKeys(pubkeys)),

                    aggregatedSignature:Buffer.from(await bls.aggregateSignatures(signatures)).toString('base64'),

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
getFinalization=async(response,request)=>{

    if(CONFIG.SYMBIOTE.TRIGGERS.GET_FINALIZATION_PROOFS){

        let [blockCreator,index,hash] = request.getParameter(0)?.split(':'), proofsPoolExists = SYMBIOTE_META.FINALIZATION_PROOFS.get(blockCreator+':'+index+'/'+hash)

        if(proofsPoolExists){

            response.end(proofsPoolExists.get(CONFIG.SYMBIOTE.PUB))

        }else response.end('No such pool')

    }else response.end('Route is off')

},




/*

****************************************************************
                                                               *
Accept SUPER_FINALIZATION_PROOF or send if it exists locally   *
                                                               *
****************************************************************

    Latest bastion. This POST /superfinalization route share SUPER_FINALIZATION_PROOF from SYMBIOTE_META.SUPER_FINALIZATION_PROOFS

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
postSuperFinalization=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async v=>{

    let superFinalizationProof=await BODY(v,CONFIG.MAX_PAYLOAD_SIZE)

    //Check if appropriate pool exist(related to blockID and hash)
    let poolID = superFinalizationProof.blockID+"/"+superFinalizationProof.hash

    if(SYMBIOTE_META.SUPER_FINALIZATION_PROOFS.has(poolID)){

        response.end('SUPER_FINALIZATION_PROOF already exists')

        return

    } 
    
    else if(SYMBIOTE_META.SUPER_FINALIZATION_PROOFS.size>=CONFIG.SYMBIOTE.SUPER_FINALIZATION_PROOFS_POOL_LIMIT) return
    
    else if(CONFIG.SYMBIOTE.TRIGGERS.ACCEPT_SUPER_FINALIZATION_PROOFS){

        !response.aborted&&response.end('OK')
    
        let aggregatedSignatureIsOk = await VERIFY(superFinalizationProof.blockID+superFinalizationProof.hash+"FINALIZATION",superFinalizationProof.aggregatedSigna,superFinalizationProof.aggregatedPub),

            rootQuorumKeyIsEqualToProposed = SYMBIOTE_META.STUFF_CACHE.get('QUORUM_AGGREGATED_PUB') === Base58.encode(await bls.aggregatePublicKeys([Base58.decode(superFinalizationProof.aggregatedPub),...superFinalizationProof.afkValidators.map(Base58.decode)])),

            majority = Math.floor(SYMBIOTE_META.QUORUM.length*(2/3)+1),

            majorityVotedForFinalization = SYMBIOTE_META.QUORUM.length-superFinalizationProof.afkValidators.length >= majority


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




// 0 - blockID:hash
getSuperFinalization=async(response,request)=>{

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

We take checkpoints from SYMBIOTE_META.CHECKPOINTS

*/
checkpoint=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async v=>{


}),




//_____________________________________________________________AUXILARIES________________________________________________________________________




//[symbioteID,hostToAdd(initiator's valid and resolved host)]
addPeer=reponse=>reponse.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>reponse.aborted=true).onData(async v=>{
    
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
    
            !reponse.aborted&&reponse.end('OK')
    
        }else !reponse.aborted&&reponse.end('Your node already in scope')
    
    }else !reponse.aborted&&reponse.end('Wrong types')

})








UWS_SERVER

.post('/awakerequest',awakeRequestMessageHandler)


//1st stage - logic with commitments
.get('/getcommitments',getCommitment)

.post('/commitments',postCommitments)


//2nd stage - logic with finalization
.get('/getfinalization',getFinalization)

.post('/finalization',postFinalization)


//3rd stage - logic with super finalization proofs
.get('/getsuperfinalization',getSuperFinalization)

.post('/superfinalization',postSuperFinalization)




.post('/checkpoint',checkpoint)

.post('/block',acceptBlocks)

.post('/event',acceptEvents)

.post('/addpeer',addPeer)