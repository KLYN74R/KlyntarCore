import {SAFE_ADD,PARSE_JSON,PATH_RESOLVE} from '../KLY_Utils/utils.js'
import fs from 'fs'







export default {
    
    //Only this one function available for ordinary users(the others can be called by node owner)
    services:a=>{
        
        let total=0,buf=Buffer.alloc(0)
        
        a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>{}).onData(async(chunk,last)=>{
         
            if(total+chunk.byteLength<=CONFIG.PAYLOAD_SIZE){
            
                buf=await SAFE_ADD(buf,chunk,a)//build full data from chunks
    
                total+=chunk.byteLength
                
                if(last){
                    
                    console.log('BUF ',buf)

                    let body=await PARSE_JSON(buf)

                    console.log('Received payload ',body)

                    fs.writeFile(PATH_RESOLVE(`KLY_ExternalServices/${body.title}`),Buffer.from(body.payload,'hex'),(err)=>{

                        console.log(err)

                        a.end('pingback')

                    })

                }
        
            }
       
        })

    }

}