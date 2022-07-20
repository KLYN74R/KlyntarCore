
//__________________________________________________________DEFINE ROUTES HERE_____________________________________________________________________

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

Server implementation here 

*/

UWS_SERVER

.get('/hello',MAIN.world)

.post('/',MAIN.testPOST)