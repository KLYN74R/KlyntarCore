/*

Collection of tests to send wrong formats of data to POST and GET routes and check the reaction of node(working with dev_tachyon workflow)

We will work with routes in dev_tachyon/main.js file

List of routes to test


POST /finalization [✅]

POST /super_finalization

GET  /get_super_finalization/:BLOCK_ID_AND_HASH

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


POST_FINALIZATION_ROUTE_TEST()