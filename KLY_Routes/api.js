import {GET_NODES,LOG,CHAIN_LABEL} from '../KLY_Space/utils.js'

import {chains,WRAP_RESPONSE} from '../klyn74r.js'








export let A={




    acccount:async(a,q)=>{

        a.onAborted(()=>a.aborted=true)

        let chain=Buffer.from(q.getParameter(0),'hex').toString('base64')
    
        if(chains.has(chain)&&CONFIG.CHAINS[chain].TRIGGERS.BALANCE){
    
            let data={
            
                ...await chains.get(chain).STATE.get(Buffer.from(q.getParameter(1),'hex').toString('base64')).catch(e=>''),
            
                COLLAPSE:chains.get(chain).VERIFICATION_THREAD.COLLAPSED_INDEX
        
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
            
                COLLAPSE:chains.get(chain).VERIFICATION_THREAD.COLLAPSED_INDEX
        
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




    multiplicity:async(a,q)=>{

        a.onAborted(()=>a.aborted=true)

        
        let chain=Buffer.from(q.getParameter(0),'hex').toString('base64'),
        
            fromHeight=+q.getParameter(1)//convert to number to get ControllerBlock's id(height)
    
    
        if(chains.has(chain) && !isNaN(fromHeight)){

    
            let chainConfig=CONFIG.CHAINS[chain],
    
                cbStorage=chains.get(chain).CONTROLLER_BLOCKS,
                
                insStorage=chains.get(chain).INSTANT_BLOCKS,

                promises=[],

                response={}



            for(let max=fromHeight+chainConfig.BLOCKS_EXPORT_PORTION;fromHeight<max;fromHeight++){

                promises.push(cbStorage.get(fromHeight).then(
                    
                    block => {
                        
                        response[block.i]={c:block,i:[]}

                        return block

                    }
                    
                ).catch(
                    
                    e => LOG(`ControllerBlock ${fromHeight} on chain ${CHAIN_LABEL(chain)} not found, load please if you need\n${e}`,'W')
                    
                ))

            }


            //Now let's fetch InstantBlocks
            let instantPromises=[]

            await Promise.all(promises.splice(0)).then(
                
                controllerBlocks => controllerBlocks.forEach(
                
                    //Go through hashes of InstantBlocks and load them
                    cBlock => cBlock.a.forEach(
                        
                        iBlockHash => instantPromises.push(insStorage.get(iBlockHash).then(
                            
                            iBlock => response[cBlock.i].i.push(iBlock)
                            
                        ).catch(

                            e => LOG(`InstantBlock ${iBlockHash} on chain ${CHAIN_LABEL(chain)} not found, load please if you need\n${e}`,'W')
                            
                        )) 
                        
                    )
                        
                )
                
            )

            await Promise.all(instantPromises.splice(0))

            !a.aborted && a.end(JSON.stringify(response))

    
        }else !a.aborted && a.end(JSON.stringify({e:'Chain not supported'}))
    
    }

}