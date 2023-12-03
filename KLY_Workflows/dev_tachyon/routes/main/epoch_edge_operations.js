import{BODY,BLAKE3,ED25519_SIGN_DATA,ED25519_VERIFY} from '../../../../KLY_Utils/utils.js'

import EPOCH_EDGE_OPERATIONS_VERIFIERS from '../../epochEdgeOperationsVerifiers.js'

import {GET_MAJORITY} from '../../utils.js'



// To accept system sync operation, verify that majority from quorum agree with it and add to mempool

/*


    {

        aggreementProofs:{

            quorumMemberPubKey0:ED25519_SIGN(BLAKE3( JSON(epochEdgeOperation) + epochFullID)),
            ...
            quorumMemberPubKeyN:<>                

        }

        epochEdgeOperation:{<your operation here>}

    }




Returns object like:

    [If verification is OK and system sync operation was added to mempool]:

        {status:'OK'}

    [Else]:

        {err:''}



*/

let epochEdgeOperationToMempool=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{


    let epochEdgeOperationWithAgreementProofs = await BODY(bytes,global.CONFIG.MAX_PAYLOAD_SIZE)

    let epochHandler = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH

    let epochFullID = epochHandler.hash+"#"+epochHandler.id


    if(!global.SYMBIOTE_META.TEMP.has(epochFullID)){

        !response.aborted && response.end(JSON.stringify({err:'Epoch handler on QT is not ready'}))

        return
    }

    
    let tempObject = global.SYMBIOTE_META.TEMP.get(epochFullID)


    if(!global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.MAIN.EPOCH_EDGE_OPERATIONS){

        !response.aborted && response.end(JSON.stringify({err:`Route is off. This node don't accept epoch edge operations`}))

        return
    }


    if(typeof epochEdgeOperationWithAgreementProofs.epochEdgeOperation !== 'object' || typeof epochEdgeOperationWithAgreementProofs.aggreementProofs !== 'object'){

        !response.aborted && response.end(JSON.stringify({err:`Wrong format. Input data must contain <epochEdgeOperation>(your operation) and <agreementProofs>(aggregated version of verification proofs from quorum members majority)`}))

        return

    }

    // Verify agreement and if OK - add to mempool

    let hashOfEpochFullIDAndOperation = BLAKE3(

        JSON.stringify(epochEdgeOperationWithAgreementProofs.epochEdgeOperation) + epochFullID

    )


    let majority = GET_MAJORITY(epochHandler)

    let promises = []

    let okSignatures = 0


    for(let [signerPubKey,signa] of Object.entries(epochEdgeOperationWithAgreementProofs.aggreementProofs)){

        promises.push(ED25519_VERIFY(hashOfEpochFullIDAndOperation,signa,signerPubKey).then(isOK => isOK && epochHandler.quorum.includes(signerPubKey) && okSignatures++))

    }

    await Promise.all(promises)

    
    if(okSignatures >= majority){

        // Add to mempool
        
        tempObject.EPOCH_EDGE_OPERATIONS_MEMPOOL.push(epochEdgeOperationWithAgreementProofs.epochEdgeOperation)

        !response.aborted && response.end(JSON.stringify({status:`OK`}))
        

    } else !response.aborted && response.end(JSON.stringify({err:`Verification failed`}))

})



/*

Body is


{
    
    type:<operation id> ===> STAKING_CONTRACT_CALL | SLASH_UNSTAKE | UPDATE_RUBICON , etc. See ../epochEdgeOperationsVerifiers.js
    
    payload:{}

}

    * Payload has different structure depending on type of EEO


*/

let epochEdgeOperationsVerifier=response=>response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>response.aborted=true).onData(async bytes=>{

    
    let epochEdgeOperation = await BODY(bytes,global.CONFIG.MAX_PAYLOAD_SIZE)

    let epochFullID = global.SYMBIOTE_META.QUORUM_THREAD.EPOCH.hash+"#"+global.SYMBIOTE_META.QUORUM_THREAD.EPOCH.id


    if(!global.SYMBIOTE_META.TEMP.has(epochFullID)){

        !response.aborted && response.end(JSON.stringify({err:'Epoch handler on QT is not ready'}))

        return
    }


    if(!global.CONFIG.SYMBIOTE.ROUTE_TRIGGERS.MAIN.EPOCH_EDGE_OPERATIONS){

        !response.aborted && response.end(JSON.stringify({err:`Route is off. This node don't accept epoch edge operations`}))

        return
    }

    //Verify and if OK - generate signature and return

    if(EPOCH_EDGE_OPERATIONS_VERIFIERS[epochEdgeOperation.type]){

        let possibleEpochEdgeOperation = await EPOCH_EDGE_OPERATIONS_VERIFIERS[epochEdgeOperation.type](epochEdgeOperation.payload,true,false).catch(error=>({isError:true,error})) // it's just verify without state changes

        if(possibleEpochEdgeOperation?.isError){
            
            !response.aborted && response.end(JSON.stringify({err:`Verification failed. Reason => ${JSON.stringify(possibleEpochEdgeOperation)}`}))

        }
        else if(possibleEpochEdgeOperation){

            // Generate signature

            let signature = await ED25519_SIGN_DATA(

                BLAKE3(JSON.stringify(possibleEpochEdgeOperation)+epochFullID),

                global.PRIVATE_KEY

            )

            !response.aborted && response.end(JSON.stringify({

                signer:global.CONFIG.SYMBIOTE.PUB,
                
                signature

            }))
       
        }
        else !response.aborted && response.end(`Verification failed.Check your input data carefully. The returned object from function => ${JSON.stringify(possibleEpochEdgeOperation)}`)

    }else !response.aborted && response.end(`No verification function for this system sync operation => ${epochEdgeOperation.type}`)

})








global.UWS_SERVER


// Handler to accept system sync operation, verify it and sign if OK. The caller is EEO creator while verifiers - current quorum members ✅
.post('/sign_epoch_edge_operation',epochEdgeOperationsVerifier)

// Handler to accept EEO with 2/3N+1 aggregated agreements which proves that majority of current quorum verified this EEO and we can add it to block header ✅
.post('/epoch_edge_operation_to_mempool',epochEdgeOperationToMempool)
