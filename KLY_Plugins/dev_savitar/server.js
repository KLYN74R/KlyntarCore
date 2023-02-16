/**
 * 
 * 


         \.   \.        __,-"-.__      ./   ./
       \.   \`.  \`.-'"" @="=^ ""`-.'/  .'/   ./
        \`.  \_`-''      @="=^      ``-'_/  .'/
         \ `-',-._   _.  @="=^  ,_   _.-,`-' /                              ███████╗ █████╗ ██╗   ██╗██╗████████╗ █████╗ ██████╗ 
      \. /`,-',-._"""  \ @="=^ /  """_.-,`-,'\ ./                           ██╔════╝██╔══██╗██║   ██║██║╚══██╔══╝██╔══██╗██╔══██╗
       \`-'  /    `-._  "       "  _.-'    \  `-'/                          ███████╗███████║██║   ██║██║   ██║   ███████║██████╔╝
       /)   (         \    ,-.    /         )   (\                          ╚════██║██╔══██║╚██╗ ██╔╝██║   ██║   ██╔══██║██╔══██╗
    ,-'"     `-.       \  /   \  /       .-'     "`-,                       ███████║██║  ██║ ╚████╔╝ ██║   ██║   ██║  ██║██║  ██║
  ,'_._         `-.____/ /  _  \ \____.-'         _._`,                     ╚══════╝╚═╝  ╚═╝  ╚═══╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝
 /,'   `.                \_/ \_/                .'   `,\
/'       )                  _                   (       `\                          
        /   _,-'"`-.  ,++|T|||T|++.  .-'"`-,_   \
       / ,-'        \/|`|`|`|'|'|'|\/        `-, \
      /,'             | | | | | | |             `,\
     /'               ` | | | | | '               `\
                        ` | | | '
                          ` | '
 * 
 * 
 * 
 * This is the server side for Savitar. We need it for instant SFP grabbing
 * 
 * The process has the following sequence
 * 
 * 
 * =================================================================================================
 * 
 * Get block => Make sure it's a chain(comparing <prevHash> with the hash of local copy of block)
 * 
 * => Return the commitment
 * 
 * => Once 2/3N+1 commitments will be received for block, the Savitar client send the aggregated version of commitments and we return the finalization proof
 * 
 * => Aggragated version of 2/3N+1 finalization proofs === SUPER_FINALIZATION_PROOF for block X with hash H
 * 
 */




//https://github.com/theturtle32/WebSocket-Node

import {BLAKE3,PATH_RESOLVE} from '../../KLY_Utils/utils.js'
import bls from '../../KLY_Utils/signatures/multisig/bls.js'
import {LOG} from '../utils.js'
import WS from 'websocket'
import https from 'https'
import fs from 'fs'



import {GET_MAJORITY,USE_TEMPORARY_DB} from '../../KLY_Workflows/dev_tachyon/utils.js'



let configs=JSON.parse(fs.readFileSync(PATH_RESOLVE('KLY_Plugins/dev_savitar/config.json')))

let WebSocketServer = WS.server;

let server = https.createServer({
  
    key:fs.readFileSync(PATH_RESOLVE(configs.TLS_KEY)),
  
    cert:fs.readFileSync(PATH_RESOLVE(configs.TLS_CERT)),
  
    //Test mTLS
    requestCert:configs.mTLS,
    
    //This is necessary only if the client uses a self-signed certificate.
    // ca: [ fs.readFileSync(configs.mTLS_CA) ]


},(_,response)=>{

    response.writeHead(404);
    response.end();

})


//TESTS:

if(CONFIG.SYMBIOTE.PUB==='75XPnpDxrAtyjcwXaATfDhkYTGBoHuonDU1tfqFc6JcNPf5sgtcsvBRXaXZGuJ8USG') configs.PORT=9333
if(CONFIG.SYMBIOTE.PUB==='61TXxKDrBtb7bjpBym8zS9xRDoUQU6sW9aLvvqN9Bp9LVFiSxhRPd9Dwy3N3621RQ8') configs.PORT=9334
if(CONFIG.SYMBIOTE.PUB==='6YHBZxZfBPk8oDPARGT4ZM9ZUPksMUngyCBYw8Ec6ufWkR6jpnjQ9HAJRLcon76sE7') configs.PORT=9335



server.listen(configs.PORT,()=>LOG({data:`Savitar WSS server was activated on port \u001b[38;5;168m${configs.PORT}`},'CD'))


let WEBSOCKET_SERVER = new WebSocketServer({
    
    httpServer: server,
    maxReceivedFrameSize:configs.MAX_FRAME_SIZE,
    maxReceivedMessageSize:configs.MAX_MSG_SIZE,
    
    
    keepalive:configs.KEEP_ALIVE,


    //The interval in milliseconds to send keepalive pings to connected clients.
    keepaliveInterval:configs.KEEP_ALIVE_INTERVAL,

    keepaliveGracePeriod:configs.KEEP_ALIVE_GRACE_PERIOD,

    
    // You should not use autoAcceptConnections for production
    // applications, as it defeats all standard cross-origin protection
    // facilities built into the protocol and the browser.  You should
    // *always* verify the connection's origin and decide whether or not
    // to accept it.
    autoAcceptConnections: false

})


let IS_ORIGIN_ALLOWED=origin=>{

  // put logic here to detect whether the specified origin is allowed.
  return true

}


//__________________________________________ Additional functionality __________________________________________


let GEN_HASH = block => {

    return BLAKE3( block.creator + block.time + JSON.stringify(block.events) + CONFIG.SYMBIOTE.SYMBIOTE_ID + block.index + block.prevHash)

}


let MANY_FINALIZATION_PROOFS_POLLING=(tempObject,blocksSet,connection)=>{

    if(blocksSet.every(blockID=>tempObject.PROOFS_RESPONSES.has(blockID))){

        let fpObject=blocksSet.map(blockID=>{

            let fp = tempObject.PROOFS_RESPONSES.get(blockID)

            tempObject.PROOFS_RESPONSES.delete(blockID)

            return {[blockID]:fp}

        })


        let finalObject = {

            from:CONFIG.SYMBIOTE.PUB,
            
            finalizationProofs:fpObject // blockId => FP

        }

        console.log('Going to send ',finalObject)

        // Instantly send response

        connection.sendUTF(JSON.stringify(finalObject))

    }else{

        //Wait a while

        setTimeout(()=>MANY_FINALIZATION_PROOFS_POLLING(tempObject,blocksSet,connection),0)

    }


}




//__________________________________________ TWO MAIN ROUTES FOR TEST __________________________________________


let RETURN_BLOCK = (blockID,connection)=>{

    //Set triggers
    if(CONFIG.SYMBIOTE.TRIGGERS.API_BLOCK){

        SYMBIOTE_META.BLOCKS.get(blockID).then(block=>

            connection.sendUTF(JSON.stringify({type:'BLOCKS_ACCEPT',payload:block}))
            
        ).catch(_=>connection.sendUTF(JSON.stringify({type:'BLOCKS_ACCEPT',payload:{reason:'No block'}})))


    }else connection.sendUTF(JSON.stringify({type:'BLOCKS_ACCEPT',payload:{reason:'Route is off'}}))

}


let ACCEPT_MANY_BLOCKS_AND_RETURN_COMMITMENTS=async(blocksArray,connection)=>{

    // connection.sendUTF(message.utf8Data);
    
    let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

    let qtPoolsMetadata = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.PAYLOAD.POOLS_METADATA

    let tempObject = SYMBIOTE_META.TEMP.get(qtPayload)


    //Check if we should accept this block.NOTE-use this option only in case if you want to stop accept blocks or override this process via custom runtime scripts or external services
    if(!CONFIG.SYMBIOTE.TRIGGERS.ACCEPT_BLOCKS){
        
        connection.sendUTF(JSON.stringify({type:'COMMITMENT_ACCEPT',payload:{reason:'Route is off'}}))
        
        return
    
    }

    if(!SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.COMPLETED || !tempObject){

        connection.sendUTF(JSON.stringify({type:'COMMITMENT_ACCEPT',payload:{reason:'QT checkpoint is incomplete'}}))

        return

    }

    if(tempObject.PROOFS_REQUESTS.has('NEXT_CHECKPOINT')){

        connection.sendUTF(JSON.stringify({type:'COMMITMENT_ACCEPT',payload:{reason:'Checkpoint is not fresh'}}))
        
        return

    }


    let commitmentsMap={}



    for(let block of blocksArray){

        let blockID = block.creator+":"+block.index

        let subchainlackOfTotalPowerForCurrentCheckpoint = tempObject.SKIP_PROCEDURE_STAGE_1.has(block.creator) || qtPoolsMetadata[block.creator]?.IS_STOPPED
    
        if(subchainlackOfTotalPowerForCurrentCheckpoint) continue

        
        let hash=GEN_HASH(block)

        console.log('REQ FOR ',blockID)

        let myCommitment = await USE_TEMPORARY_DB('get',tempObject.DATABASE,blockID).catch(_=>false)
 

        if(myCommitment){

            commitmentsMap[blockID]=myCommitment

            continue
        
        }

        
        let checkIfItsChain = block.index===0 || await SYMBIOTE_META.BLOCKS.get(block.creator+":"+(block.index-1)).then(prevBlock=>{

            //Compare hashes to make sure it's a chain

            let prevHash = GEN_HASH(prevBlock)

            return prevHash === block.prevHash

        }).catch(_=>false)


        //Otherwise - check if we can accept this block

        let allow=
    
            typeof block.events==='object' && typeof block.index==='number' && typeof block.prevHash==='string' && typeof block.sig==='string'//make general lightweight overview
            &&
            await bls.singleVerify(hash,block.sig,block.creator).catch(_=>false)//and finally-the most CPU intensive task
            &&
            checkIfItsChain
        


        if(allow){

            
            //Store it locally-we'll work with this block later
            await SYMBIOTE_META.BLOCKS.get(blockID).catch(
                    
                _ => SYMBIOTE_META.BLOCKS.put(blockID,block)
                    
            ).catch(_=>{})
            
            
            let commitment = await bls.singleSig(blockID+hash+qtPayload,global.PRIVATE_KEY)
        

            //Put to local storage to prevent double voting
            await USE_TEMPORARY_DB('put',tempObject.DATABASE,blockID,commitment).then(()=>

                commitmentsMap[blockID]=commitment

            ).catch(_=>{})


        }

        
    }

    commitmentsMap.from=CONFIG.SYMBIOTE.PUB

    console.log('Answer ',commitmentsMap)

    connection.sendUTF(JSON.stringify({type:'COMMITMENT_ACCEPT',payload:commitmentsMap}))

}




let RETURN_MANY_FINALIZATION_PROOFS=async(aggregatedCommitmentsArray,connection)=>{


    let blocksSet = []


    if(CONFIG.SYMBIOTE.TRIGGERS.SHARE_FINALIZATION_PROOF && SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.COMPLETED){


        let qtPayload = SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.PAYLOAD_HASH+SYMBIOTE_META.QUORUM_THREAD.CHECKPOINT.HEADER.ID

        if(!SYMBIOTE_META.TEMP.has(qtPayload)){
            
            connection.sendUTF(JSON.stringify({type:'COMMITMENT_ACCEPT',payload:{reason:'QT checkpoint is incomplete'}}))

            return
        }

        let tempObject = SYMBIOTE_META.TEMP.get(qtPayload)

        if(tempObject.PROOFS_REQUESTS.has('NEXT_CHECKPOINT')){

            connection.sendUTF(JSON.stringify({type:'COMMITMENT_ACCEPT',payload:{reason:'Checkpoint is not fresh'}}))
            
            return
    
        }
        
        
        for(let aggragatedCommitment of aggregatedCommitmentsArray){

            let {blockID,blockHash,aggregatedPub,aggregatedSignature,afkVoters} = aggragatedCommitment
    

            if(typeof aggregatedPub !== 'string' || typeof aggregatedSignature !== 'string' || typeof blockID !== 'string' || typeof blockHash !== 'string' || !Array.isArray(afkVoters)){


                connection.sendUTF(JSON.stringify({type:'COMMITMENT_ACCEPT',payload:{reason:'Wrong format of input params'}}))

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

        MANY_FINALIZATION_PROOFS_POLLING(tempObject,blocksSet,connection)

    }else connection.sendUTF(JSON.stringify({type:'FINALIZATION_PROOF_ACCEPT',payload:{reason:'Route is off or checkpoint is incomplete'}}))


}





WEBSOCKET_SERVER.on('request',request=>{

    if (!IS_ORIGIN_ALLOWED(request.origin)) {
    
        // Make sure we only accept requests from an allowed origin
        request.reject();
    
        return
    
    }
    
    let connection = request.accept('echo-protocol', request.origin)
    
    let msg={data:`Savitar client connected from [${request.origin}]`}


    LOG(msg,'CD')


    connection.on('message',message=>{

        if (message.type === 'utf8') {

            let data = JSON.parse(message.utf8Data)

            if(data.route==='many_blocks'){

                ACCEPT_MANY_BLOCKS_AND_RETURN_COMMITMENTS(data.payload,connection)

            }else if(data.route==='many_finalization_proofs'){

                RETURN_MANY_FINALIZATION_PROOFS(data.payload,connection)

            }else if(data.route==='get_block'){

                RETURN_BLOCK(data.payload,connection)

            }
            else if(data.route==='get_super_finalization'){

                RETURN_BLOCK(data.payload,connection)

            }
            else{

                connection.close(1337,'No available route. You can use <many_blocks> | <many_finalization_proofs>')

            }

        }
    
    })
    
    connection.on('close',(reasonCode,description)=>

        LOG({data:`Savitar client ${connection.remoteAddress} disconnected`},'CD')
    
    )

})