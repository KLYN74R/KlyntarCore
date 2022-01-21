import {BODY,GET_NODES,PATH_RESOLVE,LOG,CHAIN_LABEL} from '../KLY_Space/utils.js'

import {chains,WRAP_RESPONSE} from '../klyn74r.js'

import fs from 'fs'








export let A={




    acccount:async(a,q)=>{

        a.onAborted(()=>a.aborted=true)

        let chain=Buffer.from(q.getParameter(0),'hex').toString('base64')
    
        if(chains.has(chain)&&CONFIG.CHAINS[chain].TRIGGERS.BALANCE){
    
            let data={
            
                ...await chains.get(chain).STATE.get(Buffer.from(q.getParameter(1),'hex').toString('base64')).catch(e=>''),
            
                COLLAPSE:QUANT_CONTROL[chain].COLLAPSED_INDEX
        
            }

            !a.aborted&&WRAP_RESPONSE(a,CONFIG.CHAINS[chain].TTL.BALANCE).end(JSON.stringify(data))
    
        }else !a.aborted&&a.end('Symbiote not supported or BALANCE trigger is off')

    },



    exists:async(a,q)=>{

        a.onAborted(()=>a.aborted=true)

        let chain=Buffer.from(q.getParameter(0),'hex').toString('base64')
    
        if(chains.has(chain)&&CONFIG.CHAINS[chain].TRIGGERS.EXISTS){
    
            let data={
            
                ...await chains.get(chain).STATE.get(Buffer.from(q.getParameter(1),'hex').toString('base64')).catch(e=>''),
            
                COLLAPSE:QUANT_CONTROL[chain].COLLAPSED_INDEX
        
            }

            !a.aborted&&WRAP_RESPONSE(a,CONFIG.CHAINS[chain].TTL.BALANCE).end(JSON.stringify(data))
    
        }else !a.aborted&&a.end('Symbiote not supported or BALANCE trigger is off')

    },




    local:async(a,q)=>{

        a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true)
    
        let localNonce=(await ACCOUNTS.get(Buffer.from(q.getParameter(0),'hex').toString('base64'))).N+''
        
        !a.aborted&&a.end(localNonce)
        
    },




    info:a=>WRAP_RESPONSE(a,CONFIG.TTL.INFO).end(INFO),




    nodes:(a,q)=>{

        let chain=Buffer.from(q.getParameter(0),'hex').toString('base64')
    
        chains.has(chain)
        ?
        a.writeHeader('Access-Control-Allow-Origin','*').writeHeader('Cache-Control','max-age='+CONFIG.CHAINS[chain].TTL.NODES).end(
    
            CONFIG.CHAINS[chain].TRIGGERS.NODES&&JSON.stringify(GET_NODES(chain,q.getParameter(1)))
    
        )
        :
        !a.aborted&&a.end('Chain not supported')
    
    },




    collapsed:(a,q)=>{

        let chain=Buffer.from(q.getParameter(0),'hex').toString('base64')
    
        chains.has(chain)
        ?
        a.writeHeader('Access-Control-Allow-Origin','*').writeHeader('Cache-Control','max-age='+CONFIG.CHAINS[chain].TTL.NODES).end(
    
            JSON.stringify({id:QUANT_CONTROL[chain].EXPORT_COLLAPSE,hash:QUANT_CONTROL[chain].EXPORT_HASH,statemap:['0'],stop:QUANT_CONTROL[chain].IN_SUPERPOSITION})
    
        )
        :
        !a.aborted&&a.end('Chain not supported')
    
    },




    state:(a,q)=>{

        let chain=Buffer.from(q.getParameter(0),'hex').toString('base64'),
            
            stateId=q.getParameter(1),//useless first time,but set reminder
      
            aborted=false//if connection was aborted
    
    
    
    
        if(chains.has(chain) && CONFIG.CHAINS[chain].TRIGGERS.STATE && !QUANT_CONTROL[chain].IN_SUPERPOSITION){
            
            a.onAborted(()=>{
            
                aborted=true
                
                stateStream.emit('end','End session')
    
            })

    
            //!NOTE: Add stateID to path to get appropriate shard
            //Start read stream
            let stateStream=fs.createReadStream(PATH_RESOLVE(`SHARDS/${Buffer.from(chain,'base64').toString('hex')+stateId}.json`)).on('data',chunk=>
                    
                !aborted && a.write(chunk)
                    
            ).on('end',val=> !val && !aborted && a.end('') )//end reading and close connection
    
        
        }else !a.aborted&&a.end(`Chain not supported or superposition now.To check which symbiotes does this node support check <b>GET /i</b>.If it's superposition-try later`)
    
    
    },




    block:(a,q)=>{

        //Return ControllerBlock by index or InstantBlock by hash on appropriate chain
        let chain=Buffer.from(q.getParameter(0),'hex').toString('base64'),
            
            type=q.getParameter(1),
    
            id=q.getParameter(2)
        
    
    
        
        //Set triggers
        if(chains.has(chain)){
    
            let db=chains.get(chain)[type==='i'?'INSTANT_BLOCKS':'CONTROLLER_BLOCKS']//depends on type of block-chose appropriate db
    
            a.writeHeader('Access-Control-Allow-Origin','*').writeHeader('Cache-Control','max-age=31536000').onAborted(()=>a.aborted=true)
    
            db.get(id).then(block=>
                
                !a.aborted && a.end(JSON.stringify(block))
                
            ).catch(e=>a.end(''))
    
    
        }else !a.aborted && a.end('Chain not supported')
    
    },




    range:a=>a.writeHeader('Access-Control-Allow-Origin','*').writeHeader('Cache-Control','max-age=31536000').onAborted(()=>a.aborted=true).onData(async v=>{

        
        let {chain,fromHeight}=await BODY(v,CONFIG.MAX_PAYLOAD_SIZE)
    
    
        if(chains.has(chain)){
    
            let chainConfig=CONFIG.CHAINS[chain],
    
                cbStorage=chains.get(chain).CONTROLLER_BLOCKS,
                
                insStorage=chains.get(chain).INSTANT_BLOCKS,

                promises=[],

                response={}


            for(;fromHeight<fromHeight+chainConfig.BLOCKS_EXPORT_PORTION;fromHeight++){

                promises.push(cbStorage.get(fromHeight).then(
                    
                    block => response[fromHeight]={c:block,i:[]}
                    
                ).catch(
                    
                    e => LOG(`ControllerBlock ${fromHeight} on chain ${CHAIN_LABEL(chain)} not found, load please if you need\n${e}`,'W')
                    
                ))

            }




            //Now let's fetch InstantBlocks
            let instantPromises=[]

            await Promise.all(promises.splice(0)).then(blocks=>blocks.filter(x=>x)).then(
                
                controllerBlocks.forEach(
                
                    cBlock => {

                        //Go through hashes of InstantBlocks and load them
                        cBlock.a.forEach(
                        
                            iBlockHash => instantPromises.push(insStorage.get(iBlockHash).then(
                            
                                iBlock => response[cBlock.i].i.push(iBlock)
                            
                            ).catch(

                                e => LOG(`InstantBlock ${iBlockHash} on chain ${CHAIN_LABEL(chain)} not found, load please if you need\n${e}`,'W')
                            
                            )) 
                        
                        )
                    
                    }
                    
                )
                
            )

            await Promise.all(instantPromises.splice(0))

            a.end(JSON.stringify(response))

    
        }else !a.aborted && a.end(JSON.stringify({e:'Chain not supported'}))
    
    })

    

}