import { PATH_RESOLVE, SYMBIOTE_ALIAS } from "../../KLY_Utils/utils.js"
import { LOG } from "./localUtils.js"
import UWS from 'uWebSockets.js'
import fs from 'fs'




//Define global vars
global.STOP_GEN_BLOCK={}

global.IN_PROCESS={VERIFY:false,GENERATE:false}

global.SYSTEM_SIGNAL_ACCEPTED=false

global.SIG_PROCESS={}


//And function to export
let graceful=()=>{
    
    SYSTEM_SIGNAL_ACCEPTED=true


    console.log('\n')

    LOG('KLYNTAR stop has been initiated.Keep waiting...','I')
    
    LOG(fs.readFileSync(PATH_RESOLVE('images/events/termination.txt')).toString(),'W')
    
    //Probably stop logs on this step
    setInterval(async()=>{

        //Each subprocess in each symbiote must be stopped
        if(!IN_PROCESS.GENERATE && !IN_PROCESS.VERIFY || Object.values(SIG_PROCESS).every(x=>x)){

            console.log('\n')

            let streamsPromises=[]


            //Close logs stream
            await new Promise( resolve => SYMBIOTE_LOG_STREAM.close( e => {

                LOG(`Logging was stopped for ${SYMBIOTE_ALIAS()} ${e?'\n'+e:''}`,'I')

                resolve()
            
            }))

            LOG('Server stopped','I')

            global.UWS_DESC&&UWS.us_listen_socket_close(UWS_DESC)




            await Promise.all(streamsPromises).then(_=>{

                LOG('Node was gracefully stopped','I')
                
                process.exit(0)

            })

        }

    },200)

}


//Define listeners on typical signals to safely stop the node
process.on('SIGTERM',graceful)
process.on('SIGINT',graceful)
process.on('SIGHUP',graceful)