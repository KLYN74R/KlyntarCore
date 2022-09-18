// To query TOR services ---> curl -s --socks5-hostname 127.0.0.1:9150 http://apow7mjfryruh65chtdydfmqfpj5btws7nbocgtaovhvezgccyjazpqd.onion/
import net from 'net'



let server = net.createServer()


server.on("connection", (clientToProxySocket) => {

    console.log("Client connected to proxy");
    
    clientToProxySocket.once("data", (data) => {


        console.log(data.toString('hex'))

        console.log('======================')

        console.log('Received data ',data.toString())
        
        let authSuccess
        try{
            authSuccess = Buffer.from(data?.toString()?.split("Proxy-Authorization: Basic ")?.[1]?.split("\r\n")[0],'base64')?.toString('utf-8')==='Vlad:Cher'
        }
        
        catch(e){
            console.log(`Handled error ${e}`)
        }

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


        if (isTLSConnection) {
            clientToProxySocket.write("HTTP/1.1 200 OK\r\n\r\n");
        } else {
            proxyToServerSocket.write(data);
        }

        clientToProxySocket.pipe(proxyToServerSocket);
        proxyToServerSocket.pipe(clientToProxySocket);

        proxyToServerSocket.on("error", (err) => {
            console.log("Proxy to server error");
            console.log(err);
        });

        clientToProxySocket.on("error", (err) => {
            console.log("Client to proxy error");
            console.log(err)
        });


        //Test for HTTPQS
        proxyToServerSocket.on('data',data => {

            //console.log(`Piped data from proxy ${Buffer.from(data).toString('base64')}`);


        });
    

    });

});

server.on("error", (err) => {
    console.log("Some internal server error occurred");
    console.log(err);
});

server.on("close", () => {
    console.log("Client disconnected");
});





//Set listen
server.listen(
    {
        host: "0.0.0.0",
        port: 3128,
    },
    () => {
        console.log("Server listening on 0.0.0.0:3128");
    }
);




//__________________________________________________________________________ CONNECT _________________________________________________________________________


// import HttpsProxyAgent from 'https-proxy-agent'
// import {SocksProxyAgent} from 'socks-proxy-agent'
// import fs from 'fs'
// import fetch from 'node-fetch'


//______________________________________________________ HTTPS PROXY ______________________________________________________


// (async () => {
    
//     const proxyAgent = new HttpsProxyAgent('http://Vlad:Cher@127.0.0.1:8080');

//     console.log(proxyAgent)


//     const response = await fetch('https://www.scrapingbee.com/blog/proxy-node-fetch/', {agent:proxyAgent});
//     const body = await response.text();
//     console.log(body);

// })();



//______________________________________________________ SOCKS PROXY ______________________________________________________



// (async () => {

//   const proxyAgent = new SocksProxyAgent('socks5h://Vlad:Cher@127.0.0.1:9150')
  
//   //console.log(proxyAgent)
//   //http://rutordeepkpafpudl22pbbhzm4llbgncunvgcc66kax55sc4mp4kxcid.onion
//   const response = await fetch('http://www.showmyip.gr',{agent:proxyAgent});
//   const body = await response.text();
//   console.log(body);

// })();




// import http from 'http'

// const agent = new SocksProxyAgent('socks5h://127.0.0.1:9150');

// http.get('http://apow7mjfryruh65chtdydfmqfpj5btws7nbocgtaovhvezgccyjazpqd.onion/', {
//   agent
// }, res => {
//   res.pipe(process.stdout);
// });
