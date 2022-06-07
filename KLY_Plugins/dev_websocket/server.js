//https://github.com/theturtle32/WebSocket-Node

import {PATH_RESOLVE} from '../../KLY_Utils/utils.js'
import WS from 'websocket'
import https from 'https'
import fs from 'fs'


let configs=JSON.parse(fs.readFileSync(PATH_RESOLVE('KLY_Plugins/dev_websocket/config.json')))


let WebSocketServer = WS.server;


let server = https.createServer({
  
    key: fs.readFileSync(PATH_RESOLVE(configs.TLS_KEY)),
  
    cert: fs.readFileSync(PATH_RESOLVE(configs.TLS_CERT)),
  
    //Test mTLS
    requestCert:configs.mTLS,
    
    //This is necessary only if the client uses a self-signed certificate.
    ca: [ fs.readFileSync(PATH_RESOLVE(configs.mTLS_CA)) ]


},(request, response)=>{

    console.log((new Date()) + ' Received request for ' + request.url);
    response.writeHead(404);
    response.end();

})


server.listen(configs.PORT,()=>console.log((new Date()) + ' Server is listening on port 9999'))


let wsServer = new WebSocketServer({
    
    httpServer: server,
    maxReceivedFrameSize:configs.MAX_FRAME_SIZE,
    maxReceivedMessageSize:configs.MAX_MSG_SIZE,
    
    
    keepalive:configs.KEEP_ALIVE,


    //The interval in milliseconds to send keepalive pings to connected clients.
    keepaliveInterval:configs.KEEP_ALIVE_INTERVAL,

    keepaliveGracePeriod:configs.KEEP_ALIVE_GRACE_PERIOD,

    
    // You should not use autoAcceptConnections for production
    // applications, as it defeats all standard cross-origin protection
    // facilities built into the protocol and the browser.  You should
    // *always* verify the connection's origin and decide whether or not
    // to accept it.
    autoAcceptConnections: false

})


let originIsAllowed=origin=>{

  // put logic here to detect whether the specified origin is allowed.
  return true

}



wsServer.on('request',request=>{

    if (!originIsAllowed(request.origin)) {
    
        // Make sure we only accept requests from an allowed origin
      request.reject();
    
      console.log((new Date()) + ' Connection from origin ' + request.origin + ' rejected.')
    
      return
    
    }
    
    var connection = request.accept('echo-protocol', request.origin)

    console.log((new Date()) + ' Connection accepted.')
    
    connection.on('message',message=>{

        if (message.type === 'utf8') {
            console.log('Received Message: ' + message.utf8Data);
            connection.sendUTF(message.utf8Data);
        }
        else if (message.type === 'binary') {
            console.log('Received Binary Message of ' + message.binaryData.length + ' bytes');
            connection.sendBytes(message.binaryData);
        }
    
    })
    
    connection.on('close', function(reasonCode, description) {
        console.log((new Date()) + ' Peer ' + connection.remoteAddress + ' disconnected.');
    })

})