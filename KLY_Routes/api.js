import {GET_NODES,LOG,SYMBIOTE_ALIAS,BODY} from '../KLY_Utils/utils.js'

import {symbiotes,WRAP_RESPONSE} from '../klyn74r.js'








export default {




    acccount:async(a,q)=>{

        a.onAborted(()=>a.aborted=true)

        let symbiote=q.getParameter(0)
    
        if(symbiotes.has(symbiote)&&CONFIG.SYMBIOTES[symbiote].TRIGGERS.ACCOUNTS){
    
            let data={
            
                ...await symbiotes.get(symbiote).STATE.get(q.getParameter(1)).catch(e=>''),
            
                COLLAPSE:symbiotes.get(symbiote).VERIFICATION_THREAD.COLLAPSED_INDEX
        
            }

            !a.aborted&&WRAP_RESPONSE(a,CONFIG.SYMBIOTES[symbiote].TTL.ACCOUNTS).end(JSON.stringify(data))
    
        }else !a.aborted&&a.end('Symbiote not supported or BALANCE trigger is off')

    },



    
    info:a=>WRAP_RESPONSE(a,CONFIG.TTL.INFO).end(INFO),




    nodes:(a,q)=>{

        let symbiote=q.getParameter(0)
    
        symbiotes.has(symbiote)
        ?
        a.writeHeader('Access-Control-Allow-Origin','*').writeHeader('Cache-Control','max-age='+CONFIG.SYMBIOTES[symbiote].TTL.NODES).end(
    
            CONFIG.SYMBIOTES[symbiote].TRIGGERS.NODES&&JSON.stringify(GET_NODES(symbiote,q.getParameter(1)))
    
        )
        :
        !a.aborted&&a.end('Symbiote not supported')
    
    },





    block:(a,q)=>{

        //Return ControllerBlock by index or InstantBlock by hash on appropriate symbiote
        let symbiote=q.getParameter(0),
            
            type=q.getParameter(1)==='i'?'INSTANT_BLOCKS':'CONTROLLER_BLOCKS',
    
            id=q.getParameter(2)
        
    
    
        
        //Set triggers
        if(symbiotes.has(symbiote)&&CONFIG.SYMBIOTES[symbiote].TRIGGERS[type]){
    
            let db=symbiotes.get(symbiote)[type]//depends on type of block-chose appropriate db
    
            a.writeHeader('Access-Control-Allow-Origin','*').writeHeader('Cache-Control','max-age=31536000').onAborted(()=>a.aborted=true)
    
            db.get(id).then(block=>
                
                !a.aborted && a.end(JSON.stringify(block))
                
            ).catch(e=>a.end(''))
    
    
        }else !a.aborted && a.end('Symbiote not supported')
    
    },




    multiplicity:async(a,q)=>{

        a.onAborted(()=>a.aborted=true)

        
        let symbiote=q.getParameter(0),
        
            fromHeight=+q.getParameter(1)//convert to number to get ControllerBlock's id(height)
    
    
        if(symbiotes.has(symbiote) && CONFIG.SYMBIOTES[symbiote].TRIGGERS.MULTI && !isNaN(fromHeight)){

    
            let symbioteConfig=CONFIG.SYMBIOTES[symbiote],
    
                cbStorage=symbiotes.get(symbiote).CONTROLLER_BLOCKS,
                
                insStorage=symbiotes.get(symbiote).INSTANT_BLOCKS,

                promises=[],

                response={},

                verifThread=symbiotes.get(symbiote).VERIFICATION_THREAD



            for(let max=fromHeight+symbioteConfig.BLOCKS_EXPORT_PORTION;fromHeight<max;fromHeight++){

                //This is the signal that this node haven't process this height yet and even didn't have forward loading 
                if(fromHeight>verifThread.COLLAPSED_INDEX && !(await cbStorage.get(fromHeight).catch(e=>false))) break

                promises.push(cbStorage.get(fromHeight).then(
                    
                    block => {
                        
                        response[block.i]={c:block,i:[]}

                        return block

                    }
                    
                ).catch(
                    
                    e => LOG(`ControllerBlock \x1b[36;1m${fromHeight}\u001b[38;5;3m on symbiote \x1b[36;1m${SYMBIOTE_ALIAS(symbiote)}\u001b[38;5;3m not found, load please if you need\n${e}`,'W')
                    
                ))

            }


            //Now let's fetch InstantBlocks
            let instantPromises=[]

            await Promise.all(promises.splice(0)).then(blocks=>blocks.filter(x=>x)).then(
                
                controllerBlocks => controllerBlocks.forEach(
                
                    //Go through hashes of InstantBlocks and load them
                    cBlock => cBlock.a.forEach(
                        
                        iBlockHash => instantPromises.push(insStorage.get(iBlockHash).then(
                            
                            iBlock => response[cBlock.i].i.push(iBlock)
                            
                        ).catch(

                            e => LOG(`InstantBlock ${iBlockHash} on symbiote ${SYMBIOTE_ALIAS(symbiote)} not found, load please if you need\n${e}`,'W')
                            
                        )) 
                        
                    )
                        
                )
                
            )

            await Promise.all(instantPromises.splice(0))

            !a.aborted && a.end(JSON.stringify(response))

    
        }else !a.aborted && a.end(JSON.stringify({e:'Symbiote not supported'}))
    
    },


    alert:a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async v=>{


        let body=await BODY(v,CONFIG.PAYLOAD_SIZE)


    })

}