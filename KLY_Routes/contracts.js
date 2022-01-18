import {ACC_CONTROL,SAFE_ADD} from '../KLY_Space/utils.js'

import {contracts} from '../klyn74r.js'




export let C={
    
    //Only this one function available for ordinary users(the others can be called by node owner)
    contracts:a=>{
        
        let total=0,buf=Buffer.alloc(0)
        
        a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>{}).onData(async(chunk,last)=>{
         
            if(total+chunk.byteLength<=CONFIG.PAYLOAD_SIZE){
            
                buf=await SAFE_ADD(buf,chunk,a)//build full data from chunks
    
                total+=chunk.byteLength
                
                if(last){
                    
                    let body=await PARSE_JSON(buf)
        
                    typeof body.c==='string'&&typeof body.d==='string'&&typeof body.f==='string'
                    &&
                    await ACC_CONTROL(body.c,body.d,body.f,1,1)
                    ?
                    contracts.get(body.c).then(ctr=>{
                        
                        if(ctr.length<=CONFIG.CONTRACTS_NUM){
                        
                            ctr.push(body.c)
                        
                            contracts.put(body.c,ctr).then(()=>a.end('OK')).catch(e=>a.end(''))
                        
                        }else a.end('')
                    
                    }).catch(e=>
                    
                        e.notFound
                        ?
                        contracts.put(body.c,[body.d]).then(()=>a.end('OK')).catch(e=>a.end(''))//encrypt by RSA.In short,way of msg may be like: USER ---> RSA(msg,RSA_pub) ---> THIS NODE ---> NODE OWNER CLIENTSIDE ---> RSA(msg,RSA_prv)
                        :
                        a.end('')
                    
                    ):a.end('')
                    
                }
        
            }
       
        })

    }

}