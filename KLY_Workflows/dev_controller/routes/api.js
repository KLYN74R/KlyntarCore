import {LOG,SYMBIOTE_ALIAS} from '../../../KLY_Utils/utils.js'

import {WRAP_RESPONSE,GET_NODES} from '../utils.js'




let API = {


    // 0 - symbioteID, 1 - account
    acccount:async(a,q)=>{

        a.onAborted(()=>a.aborted=true)
    
        if(CONFIG.SYMBIOTE.SYMBIOTE_ID===q.getParameter(0)&&CONFIG.SYMBIOTE.TRIGGERS.ACCOUNTS){
    
            let data={
            
                ...await SYMBIOTE_META.STATE.get(q.getParameter(1)).catch(e=>''),
            
                COLLAPSE:SYMBIOTE_META.VERIFICATION_THREAD.COLLAPSED_INDEX
        
            }

            !a.aborted&&WRAP_RESPONSE(a,CONFIG.SYMBIOTE.TTL.ACCOUNTS).end(JSON.stringify(data))
    
        }else !a.aborted&&a.end('Symbiote not supported or BALANCE trigger is off')

    },



    
    info:a=>WRAP_RESPONSE(a,CONFIG.SYMBIOTE.TTL.INFO).end(INFO),



    // 0 - symbioteID, 1 - preffered region(close to another node)
    nodes:(a,q)=>{
    
        CONFIG.SYMBIOTE.SYMBIOTE_ID===q.getParameter(0)
        ?
        a.writeHeader('Access-Control-Allow-Origin','*').writeHeader('Cache-Control','max-age='+CONFIG.SYMBIOTE.TTL.NODES).end(
    
            CONFIG.SYMBIOTE.TRIGGERS.NODES&&JSON.stringify(GET_NODES(q.getParameter(1)))
    
        )
        :
        !a.aborted&&a.end('Symbiote not supported')
    
    },




    // 0 - symbioteID , 1 - type of block(Instant or Controller), 2 - BlockId(index for ControllerBlock and hash for InstantBlock)
    block:(a,q)=>{

        //Return ControllerBlock by index or InstantBlock by hash on appropriate symbiote
        let type=q.getParameter(1)==='i'?'INSTANT_BLOCKS':'CONTROLLER_BLOCKS',
    
            id=q.getParameter(2)
        
    
    
        
        //Set triggers
        if(CONFIG.SYMBIOTE.SYMBIOTE_ID===q.getParameter(0)&&CONFIG.SYMBIOTE.TRIGGERS[type]){
    
            let db=SYMBIOTE_META[type]//depends on type of block-chose appropriate db
    
            a.writeHeader('Access-Control-Allow-Origin','*').writeHeader('Cache-Control','max-age=31536000').onAborted(()=>a.aborted=true)
    
            db.get(id).then(block=>
                
                !a.aborted && a.end(JSON.stringify(block))
                
            ).catch(e=>a.end(''))
    
    
        }else !a.aborted && a.end('Symbiote not supported')
    
    },



    //0 - symbioteID, 1 - height from which you should export block
    multiplicity:async(a,q)=>{

        a.onAborted(()=>a.aborted=true)

        
        let symbioteID=q.getParameter(0),
        
            fromHeight=+q.getParameter(1)//convert to number to get ControllerBlock's id(height)
    
    
        if(CONFIG.SYMBIOTE.SYMBIOTE_ID===symbioteID && CONFIG.SYMBIOTE.TRIGGERS.MULTI && !isNaN(fromHeight)){

    
            let symbioteConfig=CONFIG.SYMBIOTE,
    
                cbStorage=SYMBIOTE_META.CONTROLLER_BLOCKS,
                
                insStorage=SYMBIOTE_META.INSTANT_BLOCKS,

                promises=[],

                response={},

                verifThread=SYMBIOTE_META.VERIFICATION_THREAD



            for(let max=fromHeight+symbioteConfig.BLOCKS_EXPORT_PORTION;fromHeight<max;fromHeight++){

                //This is the signal that this node haven't process this height yet and even didn't have forward loading 
                if(fromHeight>verifThread.COLLAPSED_INDEX && !(await cbStorage.get(fromHeight).catch(e=>false))) break

                promises.push(cbStorage.get(fromHeight).then(
                    
                    block => {
                        
                        response[block.i]={c:block,i:[]}

                        return block

                    }
                    
                ).catch(
                    
                    e => LOG(`ControllerBlock \x1b[36;1m${fromHeight}\u001b[38;5;3m on symbiote \x1b[36;1m${SYMBIOTE_ALIAS()}\u001b[38;5;3m not found, load please if you need\n${e}`,'W')
                    
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

                            e => LOG(`InstantBlock ${iBlockHash} on symbiote ${SYMBIOTE_ALIAS()} not found, load please if you need\n${e}`,'W')
                            
                        )) 
                        
                    )
                        
                )
                
            )

            await Promise.all(instantPromises.splice(0))

            !a.aborted && a.end(JSON.stringify(response))

    
        }else !a.aborted && a.end(JSON.stringify({e:'Symbiote not supported'}))
    
    },


    
    //Coming soon
    alert:a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async v=>{


        //Unimplemented


    })

}




UWS_SERVER

.get('/multiplicity/:symbiote/:fromHeight',API.multiplicity)

.get('/account/:symbiote/:address',API.acccount)

.get('/block/:symbiote/:type/:id',API.block)

.get('/nodes/:symbiote/:region',API.nodes)

.post('/alert',API.alert)

.get('/i',API.info)