/*

Collection of tests to send wrong formats of data to POST and GET routes and check the reaction of node(working with dev_tachyon workflow)

We will work with routes in dev_tachyon/main.js file

List of routes to test


POST /finalization [✅]

POST /super_finalization [✅]

GET  /super_finalization/:BLOCK_ID_AND_HASH [✅]

GET /payload_for_checkpoint/:PAYLOAD_HASH [✅]

POST /special_operations [✅]

POST /checkpoint_stage_1 [✅]

POST /checkpoint_stage_2 [✅]

GET /health [✅] (no params)


_______________________________ 3 Routes related to the 3 stages of the skip procedure _______________________________

POST /skip_procedure_stage_1 [✅]

POST /skip_procedure_stage_2 [✅]

POST /skip_procedure_stage_3 [✅]

GET /skip_procedure_stage_3 [✅] - required by Savitar, so skip for a while




POST /block [✅]

POST /transaction [✅]

POST /addpeer [✅]


*/


import bls from '../../KLY_Utils/signatures/multisig/bls.js'
import fetch from 'node-fetch'



//___________________________________ IMPORTS / CONSTANTS POOL ___________________________________


let CREDS = {

    url:'http://localhost:7331',

    prv:"af837c459929895651315e878f4917c7622daeb522086ec95cfe64fed2496867",
    
    pub:"7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta"

}


//___________________________________________ TESTS ______________________________________________


let POST_FINALIZATION_ROUTE_TEST=async()=>{

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

    If everything is OK - response with signa SIG(blockID+hash+'FINALIZATION'+QT.CHECKPOINT.HEADER.PAYLOAD_HASH+"#"+QT.CHECKPOINT.HEADER.ID)



[Test status]:✅(No shutdown when wrong data sent(wrong format))



*/

    let optionsToSend

    //______________________ Empty object ______________________


    // let emptyObject={}

    // optionsToSend={method:'POST',body:JSON.stringify(emptyObject)}


    // await fetch(CREDS.url+'/finalization',optionsToSend).then(r=>r.text()).then(console.log).catch(console.log)


    //______________________ Normal object ______________________

    let normalObject =   {
        
        blockID:"7cBETvyWGSvnaVbc7ZhSfRPYXmsTzZzYmraKEgxQMng8UPEEexpvVSgTuo8iza73oP:1337",

        blockHash:"0123456701234567012345670123456701234567012345670123456701234567",
        
        aggregatedPub:"7cBETvyWGSvnaVbc7ZhSfRPYXmsTzZzYmraKEgxQMng8UPEEexpvVSgTuo8iza73oP",

        aggregatedSignature:"kffamjvjEg4CMP8VsxTSfC/Gs3T/MgV1xHSbP5YXJI5eCINasivnw07f/lHmWdJjC4qsSrdxr+J8cItbWgbbqNaM+3W4HROq2ojiAhsNw6yCmSBXl73Yhgb44vl5Q8qD",

        afkVoters:[]

    }

    optionsToSend={method:'POST',body:JSON.stringify(normalObject)}

    await fetch(CREDS.url+'/finalization',optionsToSend).then(r=>r.text()).then(console.log).catch(console.log)


}


// POST_FINALIZATION_ROUTE_TEST()








let POST_SUPER_FINALIZATION_ROUTE_TEST=async()=>{

/*

****************************************************************
                                                               *
Accept SUPER_FINALIZATION_PROOF or send if it exists locally   *
                                                               *
****************************************************************

[Test status]:✅(No shutdown when wrong data sent(wrong format))

*/


    let optionsToSend

    //______________________ Empty object ______________________


    // let emptyObject={}

    // optionsToSend={method:'POST',body:JSON.stringify(emptyObject)}

    // await fetch(CREDS.url+'/super_finalization',optionsToSend).then(r=>r.text()).then(console.log).catch(console.log)


    //______________________ Normal object ______________________

    let normalObject =   {
        
        blockID:"7cBETvyWGSvnaVbc7ZhSfRPYXmsTzZzYmraKEgxQMng8UPEEexpvVSgTuo8iza73oP:1337",

        blockHash:"0123456701234567012345670123456701234567012345670123456701234567",
        
        aggregatedPub:"7cBETvyWGSvnaVbc7ZhSfRPYXmsTzZzYmraKEgxQMng8UPEEexpvVSgTuo8iza73oP",

        aggregatedSignature:"kffamjvjEg4CMP8VsxTSfC/Gs3T/MgV1xHSbP5YXJI5eCINasivnw07f/lHmWdJjC4qsSrdxr+J8cItbWgbbqNaM+3W4HROq2ojiAhsNw6yCmSBXl73Yhgb44vl5Q8qD",

        afkVoters:[]

    }

    optionsToSend={method:'POST',body:JSON.stringify(normalObject)}

    await fetch(CREDS.url+'/super_finalization',optionsToSend).then(r=>r.text()).then(console.log).catch(console.log)

}

// POST_SUPER_FINALIZATION_ROUTE_TEST()








let GET_SUPER_FINALIZATION_ROUTE_TEST=async()=>{

/*

To return SUPER_FINALIZATION_PROOF related to some block PubX:Index

Only in case when we have SUPER_FINALIZATION_PROOF we can verify block with the 100% garantee that it's the part of valid subchain and will be included to checkpoint 

Params:

    [0] - blockID+blockHash

Returns:

    {
        aggregatedSignature:<>, // blockID+hash+'FINALIZATION'+QT.CHECKPOINT.HEADER.PAYLOAD_HASH+"#"+QT.CHECKPOINT.HEADER.ID
        aggregatedPub:<>,
        afkVoters
        
    }

*/



    //______________________ Empty blockID ______________________

    await fetch(CREDS.url+'/super_finalization/').then(r=>r.text()).then(console.log).catch(console.log)

    //______________________ Normal blockID ______________________

    /*
    
    Returns 

    {"blockID":"7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta:596","blockHash":"84ff11c3f40f915cd257d4b8b1fc5887356b3320b746d8a80cb230f54bf6ba7e","aggregatedPub":"7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta","aggregatedSignature":"oIkKCqcwY1tWqeK5ZlvCdiVoiPA5f/lbVqXwwjPK1bUguOPonRV7NMNOxHjOds6JGANj+uGTb7RnkNP4ZdG3GUms1A/5Uv98EIki80PM1bWvCqaLjcEVTb2aN4laqzgh","afkVoters":[]}

    */
    await fetch(CREDS.url+'/super_finalization/'+CREDS.pub+':59684ff11c3f40f915cd257d4b8b1fc5887356b3320b746d8a80cb230f54bf6ba7e').then(r=>r.text()).then(console.log).catch(console.log)


}


// GET_SUPER_FINALIZATION_ROUTE_TEST()




let GET_PAYLOAD_FOR_CHECKPOINT_ROUTE_TEST=async()=>{


/*

GET /payload_for_checkpoint/:PAYLOAD_HASH



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
    
    
    
    //______________________ Empty hash ______________________

    await fetch(CREDS.url+'/payload_for_checkpoint/').then(r=>r.text()).then(console.log).catch(console.log)

    //_____________ Invalid hash (some random data) __________

    /*
    
    Returns 

    */
    await fetch(CREDS.url+'/payload_for_checkpoint/'+CREDS.pub+':59684ff11c3f40f915cd257d4b8b1fc5887356b3320b746d8a80cb230f54bf6ba7e').then(r=>r.text()).then(console.log).catch(console.log)
    
    
}


// GET_PAYLOAD_FOR_CHECKPOINT_ROUTE_TEST()





let TEST_SPECIAL_OPERATIONS_ROUTE=async()=>{

/*

Body is


{
    
    type:<SPECIAL_OPERATION id> ===> STAKING_CONTRACT_CALL | SLASH_UNSTAKE | UPDATE_RUBICON , etc. See ../operationsVerifiers.js
    
    payload:{}

}

    * Payload has different structure depending on type


Available SPEC_OPS to test


STAKING_CONTRACT_CALL
STOP_VALIDATOR
SLASH_UNSTAKE
REMOVE_FROM_WAITING_ROOM
RUBICON_UPDATE
WORKFLOW_UPDATE
VERSION_UPDATE


*/


    let optionsToSend

    //______________________ Empty object ______________________


    // let emptyObject={}

    // optionsToSend={method:'POST',body:JSON.stringify(emptyObject)}

    // await fetch(CREDS.url+'/special_operations',optionsToSend).then(r=>r.text()).then(console.log).catch(console.log)


    //______________________ STAKING_CONTRACT_CALL(negative test) ______________________

    let normalObject =   {
        
        type:'STAKING_CONTRACT_CALL',
        payload:'LOL'
    }

    optionsToSend={method:'POST',body:JSON.stringify(normalObject)}

    await fetch(CREDS.url+'/special_operations',optionsToSend).then(r=>r.text()).then(console.log).catch(console.log)



}


// TEST_SPECIAL_OPERATIONS_ROUTE()








let TEST_CHECKPOINT_STAGE_1_ROUTE=async()=>{


/*

Accept checkpoints from other pools in quorum and returns own version as answer
! Check the trigger START_SHARING_CHECKPOINT

[Accept]:


{
    
    ISSUER:<BLS pubkey of checkpoint grabbing initiator>,

    PREV_CHECKPOINT_PAYLOAD_HASH: global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH,
    
    POOLS_METADATA: {
                
        '7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta': {INDEX,HASH}

        /..other data
            
    },
    OPERATIONS: GET_SPECIAL_OPERATIONS(),
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

        We compare the proposition of index:hash for subchain with own version in global.SYMBIOTE_META.CHECKPOINT_MANAGER (validatorID => {INDEX,HASH,FINALIZATION_PROOF})

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

    *finalizationProof - contains the aggregated signature SIG(blockID+hash+checkpointFullID) signed by the current quorum


*/



    
    
    let optionsToSend

    //______________________ Empty object ______________________


    // let emptyObject={}

    // optionsToSend={method:'POST',body:JSON.stringify(emptyObject)}

    // await fetch(CREDS.url+'/checkpoint_stage_1',optionsToSend).then(r=>r.text()).then(console.log).catch(console.log)


    //__________ Negative test __________

    // let normalObject =   {
        
    //     ISSUER:'LOL',
    //     OPERATIONS:[],
    //     PREV_CHECKPOINT_PAYLOAD_HASH:'',
    //     POOLS_METADATA:{},
    //     OTHER_SYMBIOTES:{}
    // }

    // optionsToSend={method:'POST',body:JSON.stringify(normalObject)}

    // await fetch(CREDS.url+'/checkpoint_stage_1',optionsToSend).then(r=>r.text()).then(console.log).catch(console.log)

    
    //__________ Negative test __________

    // Here we approve that pool has never vote for block with lower index that pool already voted

    let objectLikeNormal =   {
        
        ISSUER:'LOL',
        OPERATIONS:[],
        PREV_CHECKPOINT_PAYLOAD_HASH:'',
        POOLS_METADATA:{
            "7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta":{
                IS_STOPPED:false,
                INDEX:-33
            }
        },
        OTHER_SYMBIOTES:{}
    
    }
    
    optionsToSend={method:'POST',body:JSON.stringify(objectLikeNormal)}
    
    await fetch(CREDS.url+'/checkpoint_stage_1',optionsToSend).then(r=>r.text()).then(console.log).catch(console.log)

    /*
    
    Response

    {"metadataUpdate":[{"subchain":"7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta","index":1748,"hash":"77277818a7cfaf11911ff46c260b3f4783efb5bbb416a8c7d411fe0eec9cf062","finalizationProof":{"aggregatedPub":"7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta","aggregatedSignature":"lX8DSSIVZxGogpkDvvmhfXlinCfTVSo/dSQrC7FRA50R2yPT7mNm9ZXyFs66cOSkAjSb5m+9QiHHVHjlhYhYO8PdXmB+5HR8X+LGZry0AOeDf/gjZNTtpAKyqibu/DGy","afkVoters":[]}}]}
    
    */
    
    
}
    


// TEST_CHECKPOINT_STAGE_1_ROUTE()







let TEST_CHECKPOINT_STAGE_2_ROUTE=async()=>{



/*

[Description]:

    Route for the second stage of checkpoint distribution

    [0] Here we accept the checkpoint's payload and a proof that majority has the same. Also, ISSUER_PROOF is a BLS signature of proposer of this checkpoint. We need this signature to prevent spam

    [1] If payload with appropriate hash is already in our local db - then re-sign the same hash 

    [2] If no, after verification this signature, we store this payload by its hash (<PAYLOAD_HASH> => <PAYLOAD>) to global.SYMBIOTE_META.TEMP[<QT_PAYLOAD>]

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
            
        PREV_CHECKPOINT_PAYLOAD_HASH: global.SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH,
            
        POOLS_METADATA: {
                
            '7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta': {INDEX,HASH,IS_STOPPED}

            /..other data
            
        },
        OPERATIONS: GET_SPECIAL_OPERATIONS(),
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


{"sig":"k8RjJdv/bzSGCz2I/XIZJZ1FyfomK5ZmTOgZvqB/HG6xHYF02LmgvjuWQCHAhJIeDI5s8M7L3+jZPPP3appbImuL5iweebMKPg8glEESaz6Ec/T0Lw8QrvkZZNR/5tDW"}

*/
    
    
    let optionsToSend

    //______________________ Empty object ______________________


    // let emptyObject={}

    // optionsToSend={method:'POST',body:JSON.stringify(emptyObject)}

    // await fetch(CREDS.url+'/checkpoint_stage_2',optionsToSend).then(r=>r.text()).then(console.log).catch(console.log)

    // Result = {"error":"No CHECKPOINT_FINALIZATION_PROOF in input data"}


    //__________ Negative test __________

    let normalObject =   {

        CHECKPOINT_FINALIZATION_PROOF:{},
        ISSUER_PROOF:'',
        CHECKPOINT_PAYLOAD:{}

    }

    optionsToSend={method:'POST',body:JSON.stringify(normalObject)}

    await fetch(CREDS.url+'/checkpoint_stage_2',optionsToSend).then(r=>r.text()).then(console.log).catch(console.log)

    
    //__________ Negative test __________

    // Here we approve that pool has never vote for block with lower index that pool already voted

    // let objectLikeNormal =   {
        
    //     ISSUER:'LOL',
    //     OPERATIONS:[],
    //     PREV_CHECKPOINT_PAYLOAD_HASH:'',
    //     POOLS_METADATA:{
    //         "7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta":{
    //             IS_STOPPED:false,
    //             INDEX:-33
    //         }
    //     },
    //     OTHER_SYMBIOTES:{}
    
    // }
    
    // optionsToSend={method:'POST',body:JSON.stringify(objectLikeNormal)}
    
    // await fetch(CREDS.url+'/checkpoint_stage_2',optionsToSend).then(r=>r.text()).then(console.log).catch(console.log)
    
    
}
    


// TEST_CHECKPOINT_STAGE_2_ROUTE()








let TEST_SKIP_PROCEDURE_STAGE_1_ROUTE=async()=>{


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

    [+] In case our global.SYMBIOTE_META.HEALTH_MONITORING.get(<SUBCHAIN_ID>).LAST_SEEN is too old - we can vote to init skip procedure
        For this - response with a signature like this SIG('SKIP_STAGE_1'+session+requestedSubchain+initiator)

    [+] If timeout of AFK from subchain is not too old - then response with 'OK'

    [+] Also, if we notice that requested height is lower than we have - then send own version as a proof

*/

        
        
        let optionsToSend
    
        //______________________ Empty object ______________________
    
    
        // let emptyObject={}
    
        // optionsToSend={method:'POST',body:JSON.stringify(emptyObject)}
    
        // await fetch(CREDS.url+'/skip_procedure_stage_1',optionsToSend).then(r=>r.text()).then(console.log).catch(console.log)
    
        // Result = Signature verification failed {"code":"ERR_INVALID_ARG_TYPE"}
    
    
        // __________ Negative test __________
    
        // let normalObject =   {
    
        //     session:'0000000000000000000000000000000000000000000000000000000000000000',
        
        //     initiator:CREDS.pub,
            
        //     requestedSubchain:'LOLOLO',
            
        //     height:5000,
            
        //     sig:await bls.singleSig('0000000000000000000000000000000000000000000000000000000000000000'+'LOLOLO'+5000+'-1',CREDS.prv)
    
        // }
    
        // optionsToSend={method:'POST',body:JSON.stringify(normalObject)}
    
        // await fetch(CREDS.url+'/skip_procedure_stage_1',optionsToSend).then(r=>r.text()).then(console.log).catch(console.log)
    

        // Result => No such subchain
        
        //__________ Test with valid subchain __________

        let normalObject =   {
    
            session:'0000000000000000000000000000000000000000000000000000000000000000',
        
            initiator:CREDS.pub,
            
            requestedSubchain:CREDS.pub,
            
            height:5000,
            
            sig:await bls.singleSig('0000000000000000000000000000000000000000000000000000000000000000'+CREDS.pub+5000+'-1',CREDS.prv)
    
        }
    
        optionsToSend={method:'POST',body:JSON.stringify(normalObject)}
    
        await fetch(CREDS.url+'/skip_procedure_stage_1',optionsToSend).then(r=>r.text()).then(console.log).catch(console.log)
    
        /*
        
        Result:

            If height > [CURRENT_ON_NODE]:
                {"status":"Not going to skip and my local subchain height is lower than proposed by you(local:2286 | your:5000)"}

            Else:
                {"status":"UPDATE","data":{"LAST_SEEN":1673864788361,"INDEX":2259,"HASH":"ab9cab4740f2c8fce808b272bd0c9d8e7d1213abc0aebaaf48e45554a963219f","SUPER_FINALIZATION_PROOF":{"blockID":"7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta:2259","blockHash":"ab9cab4740f2c8fce808b272bd0c9d8e7d1213abc0aebaaf48e45554a963219f","aggregatedPub":"7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta","aggregatedSignature":"peKLHov4RFMdLhnBObi1yJM2gCw2K9V1ehtq68wAEoP8jQM6yCMnfTJNukyQVY9pDWblntJleQw/dkvRMnpd3Z4H4CsKCTGeZPjnyAZyWYB/Y751mN3kNEWuS9T7a4H1","afkVoters":[]}}}

        */
        
    }
        
    
    
// TEST_SKIP_PROCEDURE_STAGE_1_ROUTE()











let TEST_SKIP_PROCEDURE_STAGE_2_ROUTE=async()=>{


    
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
            
            
            let optionsToSend
        
            //______________________ Empty object ______________________
        
        
            // let emptyObject={}
        
            // optionsToSend={method:'POST',body:JSON.stringify(emptyObject)}
        
            // await fetch(CREDS.url+'/skip_procedure_stage_2',optionsToSend).then(r=>r.text()).then(console.log).catch(console.log)
        
            // Result = {"status":"Subchain not found"}        
        

            // __________ Negative test __________
        
            let normalObject =   {
            
                subchain:CREDS.pub,
            
                height:5000,

                hash:'LOLOLO'
                    
            }
        
            optionsToSend={method:'POST',body:JSON.stringify(normalObject)}
        
            await fetch(CREDS.url+'/skip_procedure_stage_2',optionsToSend).then(r=>r.text()).then(console.log).catch(console.log)
        

            
            //__________ Test with valid subchain __________
    
            // let normalObject =   {
        
            //     session:'0000000000000000000000000000000000000000000000000000000000000000',
            
            //     initiator:CREDS.pub,
                
            //     requestedSubchain:CREDS.pub,
                
            //     height:5000,
                
            //     sig:await bls.singleSig('0000000000000000000000000000000000000000000000000000000000000000'+CREDS.pub+5000+'-1',CREDS.prv)
        
            // }
        
            // optionsToSend={method:'POST',body:JSON.stringify(normalObject)}
        
            // await fetch(CREDS.url+'/skip_procedure_stage_1',optionsToSend).then(r=>r.text()).then(console.log).catch(console.log)
        
            /*
            
            Result:
    
                If height > [CURRENT_ON_NODE]:
                    {"status":"Not going to skip and my local subchain height is lower than proposed by you(local:2286 | your:5000)"}
    
                Else:
                    {"status":"UPDATE","data":{"LAST_SEEN":1673864788361,"INDEX":2259,"HASH":"ab9cab4740f2c8fce808b272bd0c9d8e7d1213abc0aebaaf48e45554a963219f","SUPER_FINALIZATION_PROOF":{"blockID":"7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta:2259","blockHash":"ab9cab4740f2c8fce808b272bd0c9d8e7d1213abc0aebaaf48e45554a963219f","aggregatedPub":"7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta","aggregatedSignature":"peKLHov4RFMdLhnBObi1yJM2gCw2K9V1ehtq68wAEoP8jQM6yCMnfTJNukyQVY9pDWblntJleQw/dkvRMnpd3Z4H4CsKCTGeZPjnyAZyWYB/Y751mN3kNEWuS9T7a4H1","afkVoters":[]}}}
    
            */
            
        }
            
        
        
// TEST_SKIP_PROCEDURE_STAGE_2_ROUTE()




let TEST_SKIP_PROCEDURE_STAGE_3_ROUTE=async()=>{


    
  /*

[Info]:

    Route to accept requests from other quorum members about SKIP_PROCEDURE

    But, in stage 3 we get the proof that 2/3N+1 from quorum is ready to stop the subchain from height H with hash <HASH>


[Accept]:

    {
        subchain:<ID> - the subchain for which we've found proofs for SKIP_PROCEDURE_STAGE_2 on hostchain to stop from height H with hash <HASH>
    }


[Response]:

    [+] In case we have found & verified agreement of SKIP_PROCEDURE_STAGE_2 from hostchain, we have this subchainID in appropriate mapping(global.SYMBIOTE_META.SKIP_PROCEDURE_STAGE_2)
        Then,response with SIG(`SKIP_STAGE_3:${subchain}:${handler.INDEX}:${handler.HASH}:${checkpointFullID}`)

    [+] Otherwise - send NOT_FOUND status


*/
                
                
    let optionsToSend

    //______________________ Empty object ______________________


    let emptyObject={}

    optionsToSend={method:'POST',body:JSON.stringify(emptyObject)}

    await fetch(CREDS.url+'/skip_procedure_stage_3',optionsToSend).then(r=>r.text()).then(console.log).catch(console.log)

    // Result = {"status":"NOT FOUND"}   

    
}
             
            
// TEST_SKIP_PROCEDURE_STAGE_3_ROUTE()





let TEST_SEND_BLOCK_AND_GET_COMMITMENT = async() => {

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

    SIG(blockID+hash) => jXO7fLynU9nvN6Hok8r9lVXdFmjF5eye09t+aQsu+C/wyTWtqwHhPwHq/Nl0AgXDDbqDfhVmeJRKV85oSEDrMjVJFWxXVIQbNBhA7AZjQNn7UmTI75WAYNeQiyv4+R4S

    <OR> nothing


*/

    let optionsToSend

    //______________________ Empty object ______________________

    let emptyObject={}

    optionsToSend={method:'POST',body:JSON.stringify(emptyObject)}

    await fetch(CREDS.url+'/block',optionsToSend).then(r=>r.text()).then(console.log).catch(console.log)


}



// TEST_SEND_BLOCK_AND_GET_COMMITMENT()



//Format of body : {symbiote,body}
//There is no <creator> field-we get it from tx



let TEST_SEND_EVENT = async() => {

/*
    
Format of body : {symbiote,body}
There is no <creator> field-we get it from tx

*/

    let optionsToSend

    //______________________ Empty object ______________________

    // let emptyObject={}

    // optionsToSend={method:'POST',body:JSON.stringify(emptyObject)}

    // await fetch(CREDS.url+'/transaction',optionsToSend).then(r=>r.text()).then(console.log).catch(console.log)

    // Result => Event structure is wrong



    //______________________ Normal,but no filter ________________________

    // let normal = {
    //         creator:'LOL',
    //         nonce:9,
    //         sig:'fdfdf'
    //     }

    // optionsToSend={method:'POST',body:JSON.stringify(normal)}

    // await fetch(CREDS.url+'/transaction',optionsToSend).then(r=>r.text()).then(console.log).catch(console.log)

    // Result => No such filter. Make sure your <tx.type> is supported by current version of workflow runned on symbiote


    //_____________________________ Normal _______________________________

    let normal = {
        creator:CREDS.pub,
        type:'TX',
        nonce:9,
        amount:228,
        sig:'fdfdf',
        to:'LOL'
    }

    optionsToSend={method:'POST',body:JSON.stringify(normal)}

    await fetch(CREDS.url+'/transaction',optionsToSend).then(r=>r.text()).then(console.log).catch(console.log)

    // Response => Can't get filtered value of tx


}
    

// TEST_SEND_EVENT()






let ADD_PEER_TEST = async()=>{

/*

To add node to local set of peers to exchange data with

Params:

    [symbioteID,hostToAdd(initiator's valid and resolved host)]

    [0] - symbiote ID       EXAMPLE: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
    [1] - host to add       EXAMPLE: http://example.org | https://some.subdomain.org | http://cafe::babe:8888


Returns:

    'OK' - if node was added to local peers
    '<MSG>' - if some error occured

*/

    let optionsToSend

    //___________ Empty array ___________

    // let emptyArray=[]

    // optionsToSend={method:'POST',body:JSON.stringify(emptyArray)}

    // await fetch(CREDS.url+'/addpeer',optionsToSend).then(r=>r.text()).then(console.log).catch(console.log)

    // Response - "Symbiote not supported"

    //___________ Not array ___________


    // let emptyObject={}

    // optionsToSend={method:'POST',body:JSON.stringify(emptyObject)}

    // await fetch(CREDS.url+'/addpeer',optionsToSend).then(r=>r.text()).then(console.log).catch(console.log)

    // Res => Input must be a 2-elements array like [symbioteID,you_endpoint]


    //___________ Normal ___________

    
    let normArray=[
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "lalalla"
    ]

    optionsToSend={method:'POST',body:JSON.stringify(normArray)}

    await fetch(CREDS.url+'/addpeer',optionsToSend).then(r=>r.text()).then(console.log).catch(console.log)

    // Response - "Symbiote not supported"

}



// ADD_PEER_TEST()