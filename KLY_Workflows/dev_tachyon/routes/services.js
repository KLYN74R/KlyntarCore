let SERVICE_RUNNER=await import(`../../../KLY_Runners/${global.CONFIG.RUNNER}`).then(m=>m.default).catch(error=>console.log(error))




//Only this one function available for ordinary users(the others can be called by node owner)
let services=response=>{
        
        let total=0,buf=Buffer.alloc(0)
        
        response.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>{}).onData(async(chunk,last)=>{
         
            if(total+chunk.byteLength<=global.CONFIG.SYMBIOTE.MAX_PAYLOAD_SIZE){
            
                buf=await SAFE_ADD(buf,chunk,response)//build full data from chunks
    
                total+=chunk.byteLength
                
                if(last){

                    let body=await PARSE_JSON(buf)

                    response.end(body?'OK':'ERR')

                    //Run further stage
                    SERVICE_RUNNER(body)

                }
  
            }
        
        })

}



// FASTIFY_SERVER

// .post('/service',services)