

//Custom proxy for things you need on Klyntar
//https://github.com/kasattejaswi/nodejs-proxy-server/blob/main/proxy.js





import net from 'net'
import tls from 'tls'
import fs from 'fs'



//Node.js program to demonstrate thetls.createServer() method
let
PORT = 1337,
HOST = '127.0.0.1',
value = null;
   
var options = {
  key: fs.readFileSync('security/cert.key'),
  cert: fs.readFileSync('security/cert.pem'),
  ca: fs.readFileSync("security/cert.pem")
//   rejectUnauthorized: false
};
  


var server = tls.createServer(options, function(clientToProxySocket) {

    
    clientToProxySocket.pipe(clientToProxySocket)

  
  // Print the data that we received
  clientToProxySocket.on('data', function(data) {


    // let received=data.toString('utf8');

    // console.log('Received',received)



    console.log('======================')

    console.log('Received data ',data.toString())
    
    let authSuccess = Buffer.from(data.toString().split("Proxy-Authorization: Basic ")[1].split("\r\n")[0],'base64').toString('utf-8')==='Vlad:Cher'

    console.log(authSuccess)

    if(!authSuccess) clientToProxySocket.end()//close if non-authorized user



    console.log('======================')

    let isTLSConnection = data.toString().indexOf("CONNECT") !== -1;

    let serverPort = 80;
    let serverAddress;
    console.log(data.toString());
    if (isTLSConnection) {
        serverPort = 443;
        serverAddress = data
            .toString()
            .split("CONNECT")[1]
            .split(" ")[1]
            .split(":")[0];
    } else {
        serverAddress = data.toString().split("Host: ")[1].split("\r\n")[0];
    }
    console.log(serverAddress);

    // Creating a connection from proxy to destination server
    let proxyToServerSocket = net.createConnection(
        {
            host: serverAddress,
            port: serverPort,
        },
        () => {
            console.log("Proxy to server set up");
        }
    );

    clientToProxySocket.pipe(proxyToServerSocket);
    proxyToServerSocket.pipe(clientToProxySocket);

    if (isTLSConnection) {
        clientToProxySocket.write("HTTP/1.1 200 OK\r\n\r\n");
    } else {
        proxyToServerSocket.write(data);
    }


    proxyToServerSocket.on("error", (err) => {
        console.log("Proxy to server error");
        console.log(err);
    });

    clientToProxySocket.on("error", (err) => {
        console.log("Client to proxy error");
        console.log(err)
    });






  });
  
  // Stopping the server
  // by using the close() method
  server.close(() => { 
    console.log("Server closed successfully");
  });
});
  


// Start listening on a specific port and address
// by using listen() method
server.listen(PORT, HOST, function() {
  console.log("I'm listening at %s, on port %s", HOST, PORT);
});
  
// Creating and initializing client
// by using tls.connect() method

let clientOptions={

    rejectUnauthorized: false,
    servername:"www.localhost.com"

}

var client = tls.connect(PORT, HOST,clientOptions, function() {
    
  // Setting maximum send fragment limit
  // by using tlsSocket.setMaxSendFragment() method
  value = client.setMaxSendFragment(16384);
  
  if(value)
    client.write(Buffer.from('434f4e4e454354207777772e7363726170696e676265652e636f6d3a34343320485454502f312e310d0a50726f78792d417574686f72697a6174696f6e3a20426173696320566d78685a447044614756790d0a486f73743a207777772e7363726170696e676265652e636f6d0d0a436f6e6e656374696f6e3a20636c6f73650d0a0d0a','hex').toString('utf-8'));
  else
    client.write("tls fragment is not set")
    
    process.stdin.pipe(client);
    // process.stdin.resume();
    
    client.on('data',data=>console.log('FROM ',data.toString('utf-8')))



    // client.end(() => {
    //     console.log("Client closed successfully");
    // });

//   client.end(() => {
//     console.log("Client closed successfully");
//   });



});