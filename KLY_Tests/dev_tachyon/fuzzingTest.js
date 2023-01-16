/*

Collection of tests to send wrong formats of data to POST and GET routes and check the reaction of node(working with dev_tachyon workflow)

We will work with routes in dev_tachyon/main.js file

List of routes to test


POST /finalization [✅]

POST /super_finalization [✅]

GET  /get_super_finalization/:BLOCK_ID_AND_HASH [✅]

GET /get_payload_for_checkpoint/:PAYLOAD_HASH [✅]

POST /special_operations [✅]

POST /checkpoint_stage_1 [✅]

POST /checkpoint_stage_2 [✅]

GET /health [✅] (no params)


_______________________________ 3 Routes related to the 3 stages of the skip procedure _______________________________

POST /skip_procedure_stage_1

POST /skip_procedure_stage_2

POST /skip_procedure_stage_3

GET /skip_procedure_stage_3




POST /block

POST /event

POST /addpeer


*/

import {BLS_SIGN_DATA} from '../../KLY_Workflows/dev_tachyon/utils.js'

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

        afkValidators:[]

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

        afkValidators:[]

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
        aggregatedSignature:<>, // blockID+hash+'FINALIZATION'+QT.CHECKPOINT.HEADER.PAYLOAD_HASH+QT.CHECKPOINT.HEADER.ID
        aggregatedPub:<>,
        afkValidators
        
    }

*/



    //______________________ Empty blockID ______________________

    await fetch(CREDS.url+'/get_super_finalization/').then(r=>r.text()).then(console.log).catch(console.log)

    //______________________ Normal blockID ______________________

    /*
    
    Returns 

    {"blockID":"7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta:596","blockHash":"84ff11c3f40f915cd257d4b8b1fc5887356b3320b746d8a80cb230f54bf6ba7e","aggregatedPub":"7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta","aggregatedSignature":"oIkKCqcwY1tWqeK5ZlvCdiVoiPA5f/lbVqXwwjPK1bUguOPonRV7NMNOxHjOds6JGANj+uGTb7RnkNP4ZdG3GUms1A/5Uv98EIki80PM1bWvCqaLjcEVTb2aN4laqzgh","afkValidators":[]}

    */
    await fetch(CREDS.url+'/get_super_finalization/'+CREDS.pub+':59684ff11c3f40f915cd257d4b8b1fc5887356b3320b746d8a80cb230f54bf6ba7e').then(r=>r.text()).then(console.log).catch(console.log)


}


// GET_SUPER_FINALIZATION_ROUTE_TEST()




let GET_PAYLOAD_FOR_CHECKPOINT_ROUTE_TEST=async()=>{


/*

/get_payload_for_checkpoint/:PAYLOAD_HASH



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
    
    
    
    //______________________ Empty hash ______________________

    await fetch(CREDS.url+'/get_payload_for_checkpoint/').then(r=>r.text()).then(console.log).catch(console.log)

    //_____________ Invalid hash (some random data) __________

    /*
    
    Returns 

    */
    await fetch(CREDS.url+'/get_payload_for_checkpoint/'+CREDS.pub+':59684ff11c3f40f915cd257d4b8b1fc5887356b3320b746d8a80cb230f54bf6ba7e').then(r=>r.text()).then(console.log).catch(console.log)
    
    
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
    //     SUBCHAINS_METADATA:{},
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
        SUBCHAINS_METADATA:{
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

    {"metadataUpdate":[{"subchain":"7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta","index":1748,"hash":"77277818a7cfaf11911ff46c260b3f4783efb5bbb416a8c7d411fe0eec9cf062","finalizationProof":{"aggregatedPub":"7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta","aggregatedSignature":"lX8DSSIVZxGogpkDvvmhfXlinCfTVSo/dSQrC7FRA50R2yPT7mNm9ZXyFs66cOSkAjSb5m+9QiHHVHjlhYhYO8PdXmB+5HR8X+LGZry0AOeDf/gjZNTtpAKyqibu/DGy","afkValidators":[]}}]}
    
    */
    
    
}
    


// TEST_CHECKPOINT_STAGE_1_ROUTE()







let TEST_CHECKPOINT_STAGE_2_ROUTE=async()=>{



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
    //     SUBCHAINS_METADATA:{
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