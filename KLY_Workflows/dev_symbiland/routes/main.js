import{

    VERIFY,BODY,SAFE_ADD,PARSE_JSON,BLOCKLOG,BROADCAST,SYMBIOTE_ALIAS,LOG,PATH_RESOLVE,SEND_REPORT

} from '../../../KLY_Utils/utils.js'

import ControllerBlock from '../blocks/controllerblock.js'

import {symbiotes,hostchains} from '../../../klyn74r.js'

import {verifyInstantBlock} from '../verification.js'

import fs from 'fs'






//______________________________________________________________MAIN PART________________________________________________________________________




let MAIN = {




//__________________________________________________________BASIC FUNCTIONAL_____________________________________________________________________




    controllerBlock:a=>{

        let total=0,buf=Buffer.alloc(0)

        //Probably you disable for all symbiotes
        if(!CONFIG.SYMBIOTES[global.CURRENT_SYMBIOTE_ID].TRIGGERS.CONTROLLER_BLOCKS){
            
            a.end('Route is off')
            
            return
        
        }

        a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async(chunk,last)=>{
    
            if(total+chunk.byteLength<=CONFIG.MAX_PAYLOAD_SIZE){
            
                buf=await SAFE_ADD(buf,chunk,a)//build full data from chunks

                total+=chunk.byteLength
            
                if(last){
                
                    let block=await PARSE_JSON(buf),
                    
                        hash=ControllerBlock.genHash(block.c,block.a,block.i,block.p),


                    //Check if we can accept this block
                    allow=
                    

                    symbiotes.has(block.c)&&typeof block.a==='object'&&typeof block.i==='number'&&typeof block.p==='string'&&typeof block.sig==='string'//make general lightweight overview
                    &&
                    CONFIG.SYMBIOTES[block.c].TRIGGERS.CONTROLLER_BLOCKS//check if we should accept this block.NOTE-use this option only in case if you want to stop accept blocks or override this process via custom runtime scripts or external services
                    &&
                    await VERIFY(hash,block.sig,block.c)//and finally-the most CPU intensive task
                    
                    



                    if(allow){
                    
                        let controllerBlocks=symbiotes.get(block.c).CONTROLLER_BLOCKS
                        
                        controllerBlocks.get(block.i).catch(e=>{

                            BLOCKLOG(`New \x1b[36m\x1b[41;1mControllerBlock\x1b[0m\x1b[32m accepted  \x1b[31m——│`,'S',block.c,hash,59,'\x1b[31m',block.i)
                            
                            //Store it locally-we'll work with this block later
                            controllerBlocks.put(block.i,block).then(()=>
                            
                                Promise.all(BROADCAST('/cb',block,block.c))
                                
                            ).catch(e=>{})
                        
                        })
                    
                       !a.aborted&&a.end('OK')
    
                    }else !a.aborted&&a.end('Overview failed')

                }
            
            }else !a.aborted&&a.end('Payload limit')
        
        })
    
    },
    



    instantBlock:a=>{

         //Probably you disable for all symbiotes
         if(!CONFIG.SYMBIOTES[global.CURRENT_SYMBIOTE_ID].TRIGGERS.INSTANT_BLOCKS){
            
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
                            
                    !a.aborted&&a.end(CONFIG.SYMBIOTES[block.n]?.TRIGGERS?.INSTANT_BLOCKS?'OK':'Route is off')

                    verifyInstantBlock(block)

                } 
            
            }
        
        })
    
    },
    
    
    

    //Format of body : {symbiote,body}
    //There is no 'c'(creator) field-we get it from tx
    event:a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async v=>{
    
        let {symbiote,event}=await BODY(v,CONFIG.PAYLOAD_SIZE)
        
        //Reject all txs if route is off and other guards methods
        if(!(symbiotes.has(symbiote)&&CONFIG.SYMBIOTES[symbiote].TRIGGERS.TX) || typeof event?.c!=='string' || typeof event.n!=='number' || typeof event.s!=='string'){
            
            !a.aborted&&a.end('Overview failed')
            
            return

        }

        let symbioteMempool=symbiotes.get(symbiote).MEMPOOL

        

        /*
        
            ...and do such "lightweight" verification here to prevent db bloating
            Anyway we can bump with some short-term desynchronization while perform operations over ControllerBlock
            Verify and normalize object

            Fetch values about fees and MC from some DEZ sources

        */

        //The second operand tells us:if buffer is full-it makes whole logical expression FALSE
        //Also check if we have normalizer for this type of event
        if(symbioteMempool.length<CONFIG.SYMBIOTES[symbiote].EVENTS_MEMPOOL_SIZE && symbiotes.get(symbiote).FILTERS[event.t]){

            let filtered=await symbiotes.get(symbiote).FILTERS[event.t](symbiote,event)

            if(filtered){
    
                !a.aborted&&a.end('OK')

                symbioteMempool.push(event)
                            
            }else !a.aborted&&a.end('Post overview failed')


        }else !a.aborted&&a.end('Mempool is fullfilled or no such filter')
    
    }),




//_____________________________________________________________AUXILARIES________________________________________________________________________




    //[symbioteID,hostToAdd(initiator's valid and resolved host)]
    addNode:a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async v=>{

        let [symbiote,domain]=await BODY(v,CONFIG.PAYLOAD_SIZE),symbioteConfig=CONFIG.SYMBIOTES[symbiote]
        

        if(symbioteConfig&&typeof domain==='string'&&domain.length<=256){
            
            //Add more advanced logic in future(e.g instant single PING request or ask controller if this host asked him etc.)
            let nodes=symbiotes.get(symbiote).NEAR
            
            if(!(nodes.includes(domain) || symbioteConfig.PERMANENT_NEAR || symbioteConfig.MUST_SEND)){

                
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
    proof:a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async v=>{

        /*
        
        VERIFY signature and perform further logic
        Also,broadcast to the other nodes if signature is valid
        
        */

        let {symbiote,ticker,KLYNTAR_HASH,HOSTCHAIN_HASH,INDEX,SIG}=await BODY(v,CONFIG.PAYLOAD_SIZE),
        
            workflowOk=true//by default.Can be changed in case if our local collapse is higher than index in proof


        if(symbiotes.has(symbiote) && !CONFIG.SYMBIOTES[symbiote].CONTROLLER.ME && await VERIFY(KLYNTAR_HASH+INDEX+HOSTCHAIN_HASH+ticker,SIG,symbiote)){

            //Ok,so firstly we can assume that we have appropriate proof with the same INDEX and HASH
            let alreadyHas=await symbiotes.get(symbiote).HOSTCHAINS_DATA.get(INDEX+ticker).catch(e=>{

                LOG(`No proof for \x1b[36;1m${INDEX} \u001b[38;5;3mblock \x1b[36;1m(hostchain:${ticker})\u001b[38;5;3m on \x1b[36;1m${SYMBIOTE_ALIAS(symbiote)}\n${e}`,'W')

                return false

            })


            //If it's literally the same proof-just send OK
            if(alreadyHas.KLYNTAR_HASH===KLYNTAR_HASH && alreadyHas.INDEX===INDEX){
                
                !a.aborted&&a.end('OK')

                return

            }

            //If we're working higher than proof for some block we can check instantly
            symbiotes.get(get).VERIFICATION_THREAD.COLLAPSED_INDEX>=INDEX
            &&
            await symbiotes.get(symbiote).CONTROLLER_BLOCKS.get(INDEX).then(async controllerBlock=>
                
                workflowOk= ControllerBlock.genHash(symbiote,controllerBlock.a,controllerBlock.i,controllerBlock.p)===KLYNTAR_HASH
                            &&
                            await hostchains.get(symbiote).get(ticker).checkTx(HOSTCHAIN_HASH,INDEX,KLYNTAR_HASH,symbiote).catch(
                                
                                e => {
                                    
                                    LOG(`Can't check proof for \x1b[36;1m${INDEX}\u001b[38;5;3m on \x1b[36;1m${SYMBIOTE_ALIAS(symbiote)}\u001b[38;5;3m to \x1b[36;1m${ticker}\u001b[38;5;3m.Check the error to get more info\n${e}`,'W')
                                    
                                    return -1
                                
                                })

            ).catch(e=>
                
                //You also don't have ability to compare this if you don't have block locally
                LOG(`Can't check proof for \x1b[36;1m${INDEX}\u001b[38;5;3m on \x1b[36;1m${SYMBIOTE_ALIAS(symbiote)}\u001b[38;5;3m to \x1b[36;1m${ticker}\u001b[38;5;3m coz you don't have local copy of block. Check your configs-probably your STORE_CONTROLLER_BLOCKS is false\n${e}`,'W')
                    
            )    

            //False only if proof is failed
            if(workflowOk){

                CONFIG.SYMBIOTES[symbiote].WORKFLOW_CHECK.HOSTCHAINS[ticker].STORE//if option that we should locally store proofs is true
                &&
                symbiotes.get(symbiote).HOSTCHAINS_DATA
                
                    .put(INDEX+ticker,{KLYNTAR_HASH,HOSTCHAIN_HASH,SIG})

                    .then(()=>symbiotes.get(symbiote).HOSTCHAINS_DATA.put(ticker,{KLYNTAR_HASH,HOSTCHAIN_HASH,SIG,INDEX}))
                    
                    .then(()=>LOG(`Proof for block \x1b[36;1m${INDEX}\x1b[32;1m on \x1b[36;1m${SYMBIOTE_ALIAS(symbiote)}\x1b[32;1m to \x1b[36;1m${ticker}\x1b[32;1m verified and stored`,'S'))
                    
                    .catch(e=>LOG(`Can't write proof for block \x1b[36;1m${INDEX}\u001b[38;5;3m on \x1b[36;1m${SYMBIOTE_ALIAS(symbiote)}\u001b[38;5;3m to \x1b[36;1m${ticker}\u001b[38;5;3m`,'W'))


            }else if(workflowOk!==-1){
                
                LOG(fs.readFileSync(PATH_RESOLVE('images/events/fork.txt')).toString(),'F')

                LOG(`<WARNING>-found fork.Block \x1b[36;1m${INDEX}\x1b[31;1m on \x1b[36;1m${SYMBIOTE_ALIAS(symbiote)}\x1b[31;1m to \x1b[36;1m${ticker}`,'F')
                
                //Further logic.For example-send report to another host to call some trigger
                SEND_REPORT(symbiote,{height:INDEX,hostchain:ticker,hostchainTx:HOSTCHAIN_HASH})

            }
            

            !a.aborted&&a.end('OK')

            Promise.all(BROADCAST('/proof',{symbiote,ticker,KLYNTAR_HASH,HOSTCHAIN_HASH,INDEX,SIG},symbiote))


        }else !a.aborted&&a.end('Symbiote not supported or wrong signature')
    
    })

}





UWS_SERVER

.post('/cb',MAIN.controllerBlock)

.post('/ib',MAIN.instantBlock)

.post('/addnode',MAIN.addNode)

.post('/proof',MAIN.proof)

.post('/event',MAIN.event)

