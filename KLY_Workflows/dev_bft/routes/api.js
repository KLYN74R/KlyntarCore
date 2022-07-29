import {LOG,SYMBIOTE_ALIAS} from '../../../KLY_Utils/utils.js'

import {WRAP_RESPONSE,GET_NODES} from '../utils.js'




let API = {


    // 0 - symbioteID, 1 - account
    acccount:async(a,q)=>{

        a.onAborted(()=>a.aborted=true)
    
        if(CONFIG.SYMBIOTE.SYMBIOTE_ID===q.getParameter(0)&&CONFIG.SYMBIOTE.TRIGGERS.API_ACCOUNTS){
    
            let data={
            
                ...await SYMBIOTE_META.STATE.get(q.getParameter(1)).catch(e=>''),
            
                COLLAPSE:SYMBIOTE_META.VERIFICATION_THREAD.COLLAPSED_INDEX
        
            }

            !a.aborted&&WRAP_RESPONSE(a,CONFIG.SYMBIOTE.TTL.API_ACCOUNTS).end(JSON.stringify(data))
    
        }else !a.aborted&&a.end('Symbiote not supported or BALANCE trigger is off')

    },



    
    info:a=>WRAP_RESPONSE(a,CONFIG.SYMBIOTE.TTL.INFO).end(INFO),



    // 0 - symbioteID, 1 - preffered region(close to another node)
    nodes:(a,q)=>{
    
        CONFIG.SYMBIOTE.SYMBIOTE_ID===q.getParameter(0)
        ?
        a.writeHeader('Access-Control-Allow-Origin','*').writeHeader('Cache-Control','max-age='+CONFIG.SYMBIOTE.TTL.API_NODES).end(
    
            CONFIG.SYMBIOTE.TRIGGERS.API_NODES&&JSON.stringify(GET_NODES(q.getParameter(1)))
    
        )
        :
        !a.aborted&&a.end('Symbiote not supported')
    
    },




    // 0 - symbioteID , 1 - block index
    block:(a,q)=>{
    
        //Set triggers
        if(CONFIG.SYMBIOTE.SYMBIOTE_ID===q.getParameter(0)&&CONFIG.SYMBIOTE.TRIGGERS.API_BLOCK){
    
            a.writeHeader('Access-Control-Allow-Origin','*').writeHeader('Cache-Control',`max-age=${CONFIG.SYMBIOTE.TTL.API_BLOCK}`).onAborted(()=>a.aborted=true)
    
            SYMBIOTE_META.BLOCKS.get(q.getParameter(1)).then(block=>
                
                !a.aborted && a.end(JSON.stringify(block))
                
            ).catch(e=>a.end(''))
    
    
        }else !a.aborted && a.end('Symbiote not supported')
    
    },



    //0 - symbioteID, 1 - height from which you should export block
    multiplicity:async(a,q)=>{

        a.onAborted(()=>a.aborted=true)

        
        let symbioteID=q.getParameter(0),
        
            fromHeight=+q.getParameter(1)//convert to number to get block's id(height)
    
    
        if(CONFIG.SYMBIOTE.SYMBIOTE_ID===symbioteID && CONFIG.SYMBIOTE.TRIGGERS.API_MULTI && !isNaN(fromHeight)){

    
            let promises=[],

                response={}


            for(let max=fromHeight+SYMBIOTE.CONFIG.BLOCKS_EXPORT_PORTION;fromHeight<max;fromHeight++){

                //This is the signal that this node haven't process this height yet and even didn't have forward loading 
                if(fromHeight>SYMBIOTE_META.VERIFICATION_THREAD.COLLAPSED_INDEX && !(await SYMBIOTE_META.BLOCKS.get(fromHeight).catch(e=>false))) break

                promises.push(SYMBIOTE_META.BLOCKS.get(fromHeight).then(
                    
                    block => response[block.i]=block
                    
                ).catch(
                    
                    e => LOG(`Block \x1b[36;1m${fromHeight}\u001b[38;5;3m on symbiote \x1b[36;1m${SYMBIOTE_ALIAS()}\u001b[38;5;3m not found, load please if you need\n${e}`,'W')
                    
                ))

            }

            await Promise.all(promises)

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

.get('/nodes/:symbiote/:region',API.nodes)

.get('/block/:symbiote/:id',API.block)

.post('/alert',API.alert)

.get('/i',API.info)