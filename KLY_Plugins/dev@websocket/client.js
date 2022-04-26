//https://github.com/theturtle32/WebSocket-Node

import WS from 'websocket'
import fs from 'fs'



// Создаётся экземпляр клиента
var WebSocketClient = WS.client;

var client = new WebSocketClient({
    
    tlsOptions:{
    
        //With TLS
        ca:fs.readFileSync('KLY_Plugins/dev/security/rsa4096-cert.pem'),

        //For mTLS
        key:fs.readFileSync('KLY_Plugins/dev/security/localkey.pem'),
        cert:fs.readFileSync('KLY_Plugins/dev/security/localcert.pem')
    
    }

});



// Вешаем на него обработчик события подключения к серверу
client.on('connect', handler);

// Подключаемся к нужному ресурсу
client.connect('wss://localhost:9999/','echo-protocol');


function handler(connection) {
    
    connection.on('message', function (message) {
      // делаем что-нибудь с пришедшим сообщением
      console.log('Client received ',message);
    })
    
    // посылаем сообщение серверу
    let inc=0

    setInterval(()=>{

        connection.sendUTF('Hi, there!'+inc++);

    },3000)


    connection.on('close',a=>console.log('CLOSED'))
      
}