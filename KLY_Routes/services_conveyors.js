import {SAFE_ADD} from '../KLY_Utils/utils.js'

import {contracts} from '../klyn74r.js'




export default {
    
    //Only this one function available for ordinary users(the others can be called by node owner)
    accept:a=>{
        
        let total=0,buf=Buffer.alloc(0)
        
        a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>{}).onData(async(chunk,last)=>{
         
            if(total+chunk.byteLength<=CONFIG.PAYLOAD_SIZE){
            
                buf=await SAFE_ADD(buf,chunk,a)//build full data from chunks
    
                total+=chunk.byteLength
                
                if(last){
                    
                    let body=await PARSE_JSON(buf)
        
                   
                }
        
            }
       
        })

    }

}