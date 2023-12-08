import {GET_BLOCK,VERIFY_AGGREGATED_FINALIZATION_PROOF} from "../../verification.js"

import {BODY,ED25519_SIGN_DATA} from "../../../../KLY_Utils/utils.js"

import Block from "../../essences/block.js"







/*


[Info]:

    Function to return signature of rotation proof if we have SKIP_HANDLER for requested shard
    
    Returns the signature if requested height to skip >= than our own
    
    Otherwise - send the UPDATE message with FINALIZATION_PROOF 



[Accept]:

    {

        poolPubKey,

        shard

        afpForFirstBlock:{

            prevBlockHash
            blockID,    => epochID:poolPubKey:0
            blockHash,
            proofs:{

                pubkey0:signa0,         => SIG(prevBlockHash+blockID+blockHash+QT.EPOCH.HASH+"#"+QT.EPOCH.id)
                ...
                pubkeyN:signaN

            }

        }

        skipData:{

            index,
            hash,

            afp:{
                
                prevBlockHash,
                blockID,
                blockHash,

                proofs:{
                     
                    pubKey0:signa0,         => prevBlockHash+blockID+hash+QT.EPOCH.HASH+"#"+QT.EPOCH.id
                    ...
                        
                }

            }

        }

    }


[Response]:


[1] In case we have skip handler for this pool in SKIP_HANDLERS and if <skipData> in skip handler has <= index than in <skipData> from request we can response

    Also, bear in mind that we need to sign the hash of ASP for previous pool (field <previousAspHash>). We need this to verify the chains of ASPs by hashes not signatures.



    This will save us in case of a large number of ASPs that need to be checked
    
    Inserting an ASP hash for a pool that is 1 position earlier allows us to check only 1 signature and N hashes in the ASP chain
    
    Compare this with a case when we need to verify N signatures
    
    Obviously, the hash generation time and comparison with the <previousAspHash> field is cheaper than checking the aggregated signature (if considered within the O notation)
        

    Finally, we'll send this object as response

    {
        type:'OK',
        sig: ED25519_SIG('LEADER_ROTATION_PROOF:<poolPubKey>:<firstBlockHash>:<index>:<hash>:<epochFullID>')
    }


[2] In case we have bigger index in skip handler than in proposed <skipData> - response with 'UPDATE' message:

    {
        type:'UPDATE',
                        
        skipData:{

            index,
            hash,

            afp:{
                
                prevBlockHash,
                blockID,
                blockHash,

                proofs:{
                     
                    pubKey0:signa0,         => prevBlockHash+blockID+blockHash+QT.EPOCH.hash+"#"+QT.EPOCH.id
                    ...
                        
                }

            }

        }
                        
    }
    

*/
let getLeaderChangeProof=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    let epochHandler = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH

    let epochFullID = epochHandler.hash+"#"+epochHandler.id

    let tempObject = global.SYMBIOTE_META.TEMP.get(epochFullID)

    if(!tempObject){

        !response.aborted && response.end(JSON.stringify({err:'Epoch handler on QT is not ready'}))

        return
    }


    let mySkipHandlers = tempObject.SKIP_HANDLERS

    let requestForSkipProof = await BODY(bytes,global.CONFIG.MAX_PAYLOAD_SIZE)

    let overviewIsOk = typeof requestForSkipProof === 'object' && epochHandler.leadersSequence[requestForSkipProof.shard] && mySkipHandlers.has(requestForSkipProof.poolPubKey)
    
                       &&
                       
                       typeof requestForSkipProof.skipData === 'object' && (requestForSkipProof.skipData.index === -1  || typeof requestForSkipProof.skipData.afp === 'object')


    if(overviewIsOk){

        
        
        let {index,hash,afp} = requestForSkipProof.skipData

        let localSkipHandler = mySkipHandlers.get(requestForSkipProof.poolPubKey)



        // We can't sign the reassignment proof in case requested height is lower than our local version of aggregated commitments. So, send 'UPDATE' message
        if(localSkipHandler.skipData && localSkipHandler.skipData.index > index){

            let responseData = {
                
                type:'UPDATE',

                skipData:localSkipHandler.skipData // {index,hash,afp:{prevBlockHash,blockID,blockHash,proofs:{quorumMember0:signa,...,quorumMemberN:signaN}}}

            }

            !response.aborted && response.end(JSON.stringify(responseData))


        }else{

           
            //________________________________________________ Verify the proposed AFP ________________________________________________
            
            // For speed we started to use Ed25519 instead of BLS again
            
            let afpInSkipDataIsOk = false

            if(index > -1 && typeof afp.blockID === 'string'){

                let [_epochID,_blockCreator,indexOfBlockInAfp] = afp.blockID.split(':')

                if(typeof afp === 'object' && afp.blockHash === hash && index == indexOfBlockInAfp){

                    afpInSkipDataIsOk = await VERIFY_AGGREGATED_FINALIZATION_PROOF(afp,epochHandler)

                }

            }else afpInSkipDataIsOk = true

            
            if(!afpInSkipDataIsOk){

                !response.aborted && response.end(JSON.stringify({err:'Wrong aggregated signature for skipIndex > -1'}))

                return

            }


            //_____________________ Verify the AFP for the first block to understand the hash of first block ______________________________

            // We need the hash of first block to fetch it over the network and extract the ASP for previous pool in reassignment chain, take the hash of it and include to final signature
            

            let dataToSignForSkipProof, firstBlockAfpIsOk = false


            /*
            
                We also need the hash of ASP for previous pool

                In case index === -1 it's a signal that no block was created, so no ASPs for previous pool. Sign the nullhash(0123456789ab...)

                Otherwise - find block, compare it's hash with <requestForSkipProof.afpForFirstBlock.prevBlockHash>

                In case hashes match - extract the ASP for previous pool <epochHandler.leadersSequence[shard][indexOfThis-1]>, get the BLAKE3 hash and paste this hash to <dataToSignForSkipProof>
            
                [REMINDER]: Signature structure is ED25519_SIG('LEADER_ROTATION_PROOF:<poolPubKey>:<firstBlockHash>:<index>:<hash>:<epochFullID>')

            */

            if(index === -1){

                // If skipIndex is -1 then sign the hash '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'(null,default hash) as the hash of firstBlockHash
                
                dataToSignForSkipProof = `LEADER_ROTATION_PROOF:${requestForSkipProof.poolPubKey}:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef:${index}:${'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'}:${epochFullID}`

                firstBlockAfpIsOk = true


            }else if(index > 0 && typeof requestForSkipProof.afpForFirstBlock === 'object'){

                // Verify the aggregatedFinalizationProofForFirstBlock in case skipIndex > 0

                let blockIdOfFirstBlock = epochHandler.id+':'+requestForSkipProof.poolPubKey+':0'
            
                if(await VERIFY_AGGREGATED_FINALIZATION_PROOF(requestForSkipProof.afpForFirstBlock,epochHandler) && requestForSkipProof.afpForFirstBlock.blockID === blockIdOfFirstBlock){

                    let block = await GET_BLOCK(epochHandler.id,requestForSkipProof.poolPubKey,0)

                    if(block && Block.genHash(block) === requestForSkipProof.afpForFirstBlock.blockHash){

                        // In case it's prime pool - it has the first position in own reassignment chain. That's why, the hash of ASP for previous pool will be null(0123456789ab...)

                        let firstBlockHash = requestForSkipProof.afpForFirstBlock.blockHash

                        dataToSignForSkipProof = `LEADER_ROTATION_PROOF:${requestForSkipProof.poolPubKey}:${firstBlockHash}:${index}:${hash}:${epochFullID}`

                        firstBlockAfpIsOk = true                    
    
                    }

                }

            }
            
            // If proof is ok - generate reassignment proof

            if(firstBlockAfpIsOk){

                let skipMessage = {
                    
                    type:'OK',

                    sig:await ED25519_SIGN_DATA(dataToSignForSkipProof,global.PRIVATE_KEY)
                }

                !response.aborted && response.end(JSON.stringify(skipMessage))

                
            }else !response.aborted && response.end(JSON.stringify({err:`Wrong signatures in <afpForFirstBlock>`}))

             
        }


    }else !response.aborted && response.end(JSON.stringify({err:'Wrong format'}))


})



/*

[Info]:

    Accept indexes of authorities on shards by requester version and return required data to define finalization pair for previous leaders (heigth+hash)

[Accept]:

    {
        primePoolPubKey:<index of current leader on shard by requester version>
        ...
    }

[Returns]:

    {
        primePoolPubKey(shardID):<aggregatedSkipProofForProposedLeader>
        ...
    
    }

*/
let getDataToBuildTempDataForVerificationThread=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    let epochHandler = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH

    let epochFullID = epochHandler.hash+"#"+epochHandler.id

    let tempObject = global.SYMBIOTE_META.TEMP.get(epochFullID)

    if(!tempObject){

        !response.aborted && response.end(JSON.stringify({err:'Epoch handler on QT is not ready'}))

        return
    }


    let proposedIndexesOfAuthorities = await BODY(bytes,global.CONFIG.MAX_PAYLOAD_SIZE) // format {primePoolPubKey:index}


    if(typeof proposedIndexesOfAuthorities === 'object'){

        let objectToReturn = {}

        // Here we should return the ASP for proposed authorities

        for(let [shardID, proposedIndexOfLeader] of Object.entries(proposedIndexesOfAuthorities)){

            if(epochHandler.leadersSequence[shardID]){

                let pubKeyOfPoolByThisIndex = epochHandler.leadersSequence[shardID][proposedIndexOfLeader] || shardID

                let aggregatedSkipProofForThisPool = tempObject.SKIP_HANDLERS.get(pubKeyOfPoolByThisIndex)?.aggregatedSkipProof

                objectToReturn[shardID] = aggregatedSkipProofForThisPool

            }


        }

        !response.aborted && response.end(JSON.stringify(objectToReturn))

    } else !response.aborted && response.end(JSON.stringify({err:'Wrong format'}))


})




global.UWS_SERVER


// Function to return signature of proof that we've changed the leader for some shard. Returns the signature if requested FINALIZATION_STATS.index >= than our own or send UPDATE message✅
.post('/leader_rotation_proof',getLeaderChangeProof)

// Function to return aggregated skip proofs for proposed authorities✅
.post('/data_to_build_temp_data_for_verification_thread',getDataToBuildTempDataForVerificationThread)