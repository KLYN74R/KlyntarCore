/*



████████╗ ██████╗ ██████╗          ██╗ ██╗         ██╗██████╗ ██████╗          ██╗ ██╗         ██╗██████╗ ███████╗███████╗         ██╗ ██╗         ███████╗███████╗██████╗  ██████╗ ███╗   ██╗███████╗████████╗
╚══██╔══╝██╔═══██╗██╔══██╗        ████████╗        ██║╚════██╗██╔══██╗        ████████╗        ██║██╔══██╗██╔════╝██╔════╝        ████████╗        ╚══███╔╝██╔════╝██╔══██╗██╔═══██╗████╗  ██║██╔════╝╚══██╔══╝
   ██║   ██║   ██║██████╔╝        ╚██╔═██╔╝        ██║ █████╔╝██████╔╝        ╚██╔═██╔╝        ██║██████╔╝█████╗  ███████╗        ╚██╔═██╔╝          ███╔╝ █████╗  ██████╔╝██║   ██║██╔██╗ ██║█████╗     ██║   
   ██║   ██║   ██║██╔══██╗        ████████╗        ██║██╔═══╝ ██╔═══╝         ████████╗        ██║██╔═══╝ ██╔══╝  ╚════██║        ████████╗         ███╔╝  ██╔══╝  ██╔══██╗██║   ██║██║╚██╗██║██╔══╝     ██║   
   ██║   ╚██████╔╝██║  ██║        ╚██╔═██╔╝        ██║███████╗██║             ╚██╔═██╔╝        ██║██║     ██║     ███████║        ╚██╔═██╔╝        ███████╗███████╗██║  ██║╚██████╔╝██║ ╚████║███████╗   ██║   
   ╚═╝    ╚═════╝ ╚═╝  ╚═╝         ╚═╝ ╚═╝         ╚═╝╚══════╝╚═╝              ╚═╝ ╚═╝         ╚═╝╚═╝     ╚═╝     ╚══════╝         ╚═╝ ╚═╝         ╚══════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚══════╝   ╚═╝  


                                                                               And more networks soon!

    Author:VladChernenko (@V14D4RT3M)

    Description: Router which you can add to your workflow and interact with nodes in this networks e.g.
    receive blocks exchange services data and so on. Currently we can send data to TOR hidden services which
    are KLYNTAR nodes via SOCKS5 TOR proxy




*/

import {PATH_RESOLVE,SAFE_ADD,PARSE_JSON} from '../../KLY_Utils/utils.js'
import UWS from 'uWebSockets.js'
import {LOG} from '../utils.js'
import fetch from 'node-fetch'
import fs from 'fs'


//
import {SocksProxyAgent} from 'socks-proxy-agent'

//For HTTP/HTTPS proxies
//import HttpsProxyAgent from 'https-proxy-agent'


let conf=JSON.parse(fs.readFileSync(PATH_RESOLVE('KLY_Plugins/dev_nets_gateway/configs.json')))

let agent



if(conf.TOR.ENABLE){

    //Use TOR nodes as hidden service and get access to them+received data back
    agent = new SocksProxyAgent('socks5h://127.0.0.1:5666')


}



//_______________________________________________________ START _______________________________________________________




let instantBlock=a=>{

    let total=0,buf=Buffer.alloc(0)

    a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async(chunk,last)=>{

        
            buf=await SAFE_ADD(buf,chunk,a)//build full data from chunks

            total+=chunk.byteLength
        
            if(last){

                let block=await PARSE_JSON(buf)
                        
                !a.aborted&&a.end('OK')

                

                //Go through TOR nodes
                conf.TOR.DESTINATION.forEach(
                    
                    hidService => fetch(hidService,{method:'POST',body:JSON.stringify(block),agent}).then(r=>r.text()).then(
                        
                        text => console.log(`Tor routing success ${text}`)
                        
                    ).catch(e=>{}))


            } 
    
    
    })

}




UWS.App()

.post('/ib',instantBlock)





.listen(4444,ok=>LOG({data:'Router started',pid:process.pid},'CD'))