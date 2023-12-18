
//__________________________________________________________DEFINE ROUTES HERE_____________________________________________________________________

import {FASTIFY_SERVER} from "../../../klyn74r.js"

//! Name isn't abligatory, choose anything you want. BTW you can write handlers even without this object
let MAIN = {
    
    world:a=>{

        a.end('Hello World!')

    },

      
    testPOST:a=>{

        a.end('Hello World!')

    }
    
}    


//__________________________________________________________SET ROUTES MAP HERE_____________________________________________________________________




FASTIFY_SERVER

.get('/hello',MAIN.world)

.post('/another',MAIN.testPOST)