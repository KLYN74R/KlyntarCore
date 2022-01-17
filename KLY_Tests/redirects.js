/*
________________________________________________On bastion(reverse proxy(NGINX,Traefik,HAProxy,etc.),SWG,LB,some cloud redirector,etc.) node_______________________________________________
  
  
.post('/lol',a=>a.writeStatus('307 Temporary Redirect').writeHeader('Location','http://localhost:7777/lol').writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>{console.log('DADADADADAD')}).end('Q'))

___________________________________________________________________________________On worker node__________________________________________________________________________________________

.post('/lol',a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>{}).onData(async v=>{
        
    let b=await BODY(v,global.CONFIG.PAYLOAD_SIZE)
    console.log(b)
    a.end('OK)')

}))



*/



