import {SAFE_ADD,PARSE_JSON} from '../../../KLY_Utils/utils.js'




let SERVICE_RUNNER=await import(`../../../KLY_Runners/${CONFIG.RUNNER}`).then(m=>m.default).catch(e=>console.log(e)),




//Only this one function available for ordinary users(the others can be called by node owner)
services=(a)=>{
        
        let total=0,buf=Buffer.alloc(0)
        
        a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>{}).onData(async(chunk,last)=>{
         
            if(total+chunk.byteLength<=CONFIG.MAX_PAYLOAD_SIZE){
            
                buf=await SAFE_ADD(buf,chunk,a)//build full data from chunks
    
                total+=chunk.byteLength
                
                if(last){

                    let body=await PARSE_JSON(buf)

                    a.end(body?'OK':'ERR')

                    //Run further stage
                    SERVICE_RUNNER(body)

                }
  
            }
        
        })

}



UWS_SERVER

.post('/service',services)