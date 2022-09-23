import{

    VERIFY,BODY,SAFE_ADD,PARSE_JSON,BLOCKLOG,SYMBIOTE_ALIAS,LOG,PATH_RESOLVE

} from '../../../KLY_Utils/utils.js'

import ControllerBlock from '../blocks/controllerblock.js'

import {verifyInstantBlock} from '../verification.js'

import {SEND_REPORT,BROADCAST} from '../utils.js'

import fs from 'fs'




let

//__________________________________________________________BASIC FUNCTIONAL_____________________________________________________________________




controllerBlock=a=>{

    let total=0,buf=Buffer.alloc(0)

    //Probably you disable for all symbiotes
    if(!CONFIG.SYMBIOTE.TRIGGERS.CONTROLLER_BLOCKS){
        
        a.end('Route is off')
        
        return
    
    }

    a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async(chunk,last)=>{

        if(total+chunk.byteLength<=CONFIG.MAX_PAYLOAD_SIZE){
        
            buf=await SAFE_ADD(buf,chunk,a)//build full data from chunks
       
            total+=chunk.byteLength
        
            if(last){
            

                let block=await PARSE_JSON(buf),
                
                    hash=ControllerBlock.genHash(block.a,block.i,block.p),
       
                //Check if we can accept this block
                allow=
                
                CONFIG.SYMBIOTE.CONTROLLER.PUBKEY===block.c&&typeof block.a==='object'&&typeof block.i==='number'&&typeof block.p==='string'&&typeof block.sig==='string'//make general lightweight overview
                &&
                CONFIG.SYMBIOTE.TRIGGERS.CONTROLLER_BLOCKS//check if we should accept this block.NOTE-use this option only in case if you want to stop accept blocks or override this process via custom runtime scripts or external services
                &&
                await VERIFY(hash,block.sig,block.c)//and finally-the most CPU intensive task
                
                

                if(allow){
                        
                    SYMBIOTE_META.CONTROLLER_BLOCKS.get(block.i).catch(e=>{

                        BLOCKLOG(`New \x1b[36m\x1b[41;1mControllerBlock\x1b[0m\x1b[32m accepted  \x1b[31m——│`,'S',block.c,hash,59,'\x1b[31m',block.i)
                            
                        //Store it locally-we'll work with this block later
                        SYMBIOTE_META.CONTROLLER_BLOCKS.put(block.i,block).then(()=>
                            
                            Promise.all(BROADCAST('/cb',block,block.c))
                                
                        ).catch(e=>{})
                        
                    })
                    
                    !a.aborted&&a.end('OK')
    
                }else !a.aborted&&a.end('Overview failed')

            }
            
        }else !a.aborted&&a.end('Payload limit')
        
    })
    
},
    



instantBlock=a=>{
     
    //Probably you disable for all symbiotes
    if(!CONFIG.SYMBIOTE.TRIGGERS.INSTANT_BLOCKS){
        
        a.end('Route is off')
        
        return
    
    }
    
    let total=0,buf=Buffer.alloc(0)

    a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async(chunk,last)=>{

        if(total+chunk.byteLength<=CONFIG.MAX_PAYLOAD_SIZE){
        
            buf=await SAFE_ADD(buf,chunk,a)//build full data from chunks

            total+=chunk.byteLength
        
            if(last){

                let block=await PARSE_JSON(buf)
                        
                !a.aborted&&a.end(CONFIG.SYMBIOTE.TRIGGERS?.INSTANT_BLOCKS?'OK':'Route is off')

                verifyInstantBlock(block)

            } 
        
        }
    
    })

},
    



//Format of body : {symbiote,body}
//There is no 'c'(creator) field-we get it from tx
acceptEvents=a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async v=>{

    let {symbiote,event}=await BODY(v,CONFIG.PAYLOAD_SIZE)
    
    //Reject all txs if route is off and other guards methods
    if(!(CONFIG.SYMBIOTE.SYMBIOTE_ID===symbiote&&CONFIG.SYMBIOTE.TRIGGERS.TX) || typeof event?.c!=='string' || typeof event.n!=='number' || typeof event.s!=='string'){
        
        !a.aborted&&a.end('Overview failed')
        
        return
    }        
    /*
    
        ...and do such "lightweight" verification here to prevent db bloating
        Anyway we can bump with some short-term desynchronization while perform operations over ControllerBlock
        Verify and normalize object
        Fetch values about fees and MC from some DEZ sources
    */
    //The second operand tells us:if buffer is full-it makes whole logical expression FALSE
    //Also check if we have normalizer for this type of event
    if(SYMBIOTE_META.MEMPOOL.length<CONFIG.SYMBIOTE.EVENTS_MEMPOOL_SIZE && SYMBIOTE_META.FILTERS[event.t]){

        let filtered=await SYMBIOTE_META.FILTERS[event.t](symbiote,event)

        if(filtered){

            !a.aborted&&a.end('OK')

            SYMBIOTE_META.MEMPOOL.push(event)
                        
        }else !a.aborted&&a.end('Post overview failed')

    }else !a.aborted&&a.end('Mempool is fullfilled or no such filter')

}),




//_____________________________________________________________AUXILARIES________________________________________________________________________




//[symbioteID,hostToAdd(initiator's valid and resolved host)]
addNode=a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async v=>{
    
    let [domain]=await BODY(v,CONFIG.PAYLOAD_SIZE),symbioteConfig=CONFIG.SYMBIOTE
    
    if(symbioteConfig&&typeof domain==='string'&&domain.length<=256){
        
        //Add more advanced logic in future(e.g instant single PING request or ask controller if this host asked him etc.)
        let nodes=SYMBIOTE_META.PEERS
        
        if(!(nodes.includes(domain) || symbioteConfig.BOOTSTRAP_NODES || symbioteConfig.MUST_SEND)){
            
            nodes.length<symbioteConfig.MAX_CONNECTIONS
            ?
            nodes.push(domain)
            :
            nodes[~~(Math.random() * nodes.length)]=domain//if no place-paste instead of random node
    
            !a.aborted&&a.end('OK')
    
        }else !a.aborted&&a.end('Domain already in scope')
    
    }else !a.aborted&&a.end('Wrong types')

}),




//Passive mode enabled by default    
proof=a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async v=>{

        /*
        
    VERIFY signature and perform further logic
        Also,broadcast to the other nodes if signature is valid
        
        */

        let {symbiote,ticker,KLYNTAR_HASH,HOSTCHAIN_HASH,INDEX,SIG}=await BODY(v,CONFIG.PAYLOAD_SIZE),
        
            workflowOk=true//by default.Can be changed in case if our local collapse is higher than index in proof


        if(CONFIG.SYMBIOTE.SYMBIOTE_ID===symbiote && !CONFIG.SYMBIOTE.CONTROLLER.ME && await VERIFY(KLYNTAR_HASH+INDEX+HOSTCHAIN_HASH+ticker,SIG,symbiote)){

            //Ok,so firstly we can assume that we have appropriate proof with the same INDEX and HASH
            let alreadyHas=await SYMBIOTE_META.HOSTCHAINS_DATA.get(INDEX+ticker).catch(e=>{

                LOG(`No proof for \x1b[36;1m${INDEX} \u001b[38;5;3mblock \x1b[36;1m(hostchain:${ticker})\u001b[38;5;3m on \x1b[36;1m${SYMBIOTE_ALIAS()}\n${e}`,'W')

                return false

            })


            //If it's literally the same proof-just send OK
            if(alreadyHas.KLYNTAR_HASH===KLYNTAR_HASH && alreadyHas.INDEX===INDEX){
                
                !a.aborted&&a.end('OK')

                return

            }

            //If we're working higher than proof for some block we can check instantly
            SYMBIOTE_META.VERIFICATION_THREAD.COLLAPSED_INDEX>=INDEX
            &&
            await SYMBIOTE_META.CONTROLLER_BLOCKS.get(INDEX).then(async controllerBlock=>
                
                workflowOk= ControllerBlock.genHash(controllerBlock.a,controllerBlock.i,controllerBlock.p)===KLYNTAR_HASH
                            &&
                            await HOSTCHAINS.CONNECTORS.get(ticker).checkCommit(HOSTCHAIN_HASH,INDEX,KLYNTAR_HASH).catch(
                                
                                error => {
                                    
                                    LOG(`Can't check proof for \x1b[36;1m${INDEX}\u001b[38;5;3m on \x1b[36;1m${SYMBIOTE_ALIAS()}\u001b[38;5;3m to \x1b[36;1m${ticker}\u001b[38;5;3m.Check the error to get more info\n${error}`,'W')
                                    
                                    return -1
                                
                                })

            ).catch(e=>
                
                //You also don't have ability to compare this if you don't have block locally
                LOG(`Can't check proof for \x1b[36;1m${INDEX}\u001b[38;5;3m on \x1b[36;1m${SYMBIOTE_ALIAS()}\u001b[38;5;3m to \x1b[36;1m${ticker}\u001b[38;5;3m coz you don't have local copy of block. Check your configs-probably your STORE_CONTROLLER_BLOCKS is false\n${e}`,'W')
                    
            )    

            //False only if proof is failed
            if(workflowOk){

                CONFIG.SYMBIOTE.MONITORING.HOSTCHAINS[ticker].STORE//if option that we should locally store proofs is true
                &&
                SYMBIOTE_META.HOSTCHAINS_DATA
                
                    .put(INDEX+ticker,{KLYNTAR_HASH,HOSTCHAIN_HASH,SIG})

                    .then(()=>SYMBIOTE_META.HOSTCHAINS_DATA.put(ticker,{KLYNTAR_HASH,HOSTCHAIN_HASH,SIG,INDEX}))
                    
                    .then(()=>LOG(`Proof for block \x1b[36;1m${INDEX}\x1b[32;1m on \x1b[36;1m${SYMBIOTE_ALIAS()}\x1b[32;1m to \x1b[36;1m${ticker}\x1b[32;1m verified and stored`,'S'))
                    
                    .catch(e=>LOG(`Can't write proof for block \x1b[36;1m${INDEX}\u001b[38;5;3m on \x1b[36;1m${SYMBIOTE_ALIAS()}\u001b[38;5;3m to \x1b[36;1m${ticker}\u001b[38;5;3m`,'W'))


            }else if(workflowOk!==-1){
                
                LOG(fs.readFileSync(PATH_RESOLVE('images/events/fork.txt')).toString(),'F')

                LOG(`<WARNING>-found fork.Block \x1b[36;1m${INDEX}\x1b[31;1m on \x1b[36;1m${SYMBIOTE_ALIAS()}\x1b[31;1m to \x1b[36;1m${ticker}`,'F')
                
                //Further logic.For example-send report to another host to call some trigger
                SEND_REPORT(symbiote,{height:INDEX,hostchain:ticker,hostchainTx:HOSTCHAIN_HASH})

            }
            

            !a.aborted&&a.end('OK')

            Promise.all(BROADCAST('/proof',{symbiote,ticker,KLYNTAR_HASH,HOSTCHAIN_HASH,INDEX,SIG},symbiote))


        }else !a.aborted&&a.end('Symbiote not supported or wrong signature')
    
    })




UWS_SERVER

.post('/cb',controllerBlock)

.post('/event',acceptEvents)

.post('/ib',instantBlock)

.post('/addnode',addNode)

.post('/proof',proof)


