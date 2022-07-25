
//__________________________________________________________DEFINE ROUTES HERE_____________________________________________________________________

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


/*

UWS_SERVER - is a global variable which represents the intance of server

Server implementation here https://github.com/uNetworking/uWebSockets.js

*/

UWS_SERVER

.get('/hello',MAIN.world)

.post('/another',MAIN.testPOST)