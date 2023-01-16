/*

Collection of tests to send wrong formats of data to POST and GET routes and check the reaction of node(working with dev_tachyon workflow)

We will work with routes in dev_tachyon/main.js file

List of routes to test


POST /finalization [✅]

POST /super_finalization [✅]

GET  /get_super_finalization/:BLOCK_ID_AND_HASH [✅]

GET /get_payload_for_checkpoint/:PAYLOAD_HASH

POST /special_operations

POST /checkpoint_stage_1

POST /checkpoint_stage_2

GET /health

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