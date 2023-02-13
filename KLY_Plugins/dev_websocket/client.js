//https://github.com/theturtle32/WebSocket-Node

import WS from 'websocket'
import fs from 'fs'

import {SocksProxyAgent} from 'socks-proxy-agent'


// Создаётся экземпляр клиента
var WebSocketClient = WS.client;

var client = new WebSocketClient({
    
    tlsOptions:{
    
        // With TLS
        ca:fs.readFileSync('C:/Users/Acer/MyProjects/Klyntar/KlyntarCore/KLY_Plugins/dev_tips/security/2022.crt'),

        //For mTLS
        // key:fs.readFileSync('KLY_Plugins/dev_tips/security/localkey.pem'),
        // cert:fs.readFileSync('KLY_Plugins/dev_tips/security/localcert.pem')

        agent:new SocksProxyAgent('socks5h://127.0.0.1:5666')
    
    }

});


// Подключаемся к нужному ресурсу
client.connect('wss://localhost:9999/','echo-protocol');


// Вешаем на него обработчик события подключения к серверу
client.on('connect', handler);

client.on('connectFailed',console.log)

function handler(connection) {
    
    connection.on('message', function (message) {
      // делаем что-нибудь с пришедшим сообщением
      console.log('Client received ',message);
    })
    
    // посылаем сообщение серверу
    let inc=0

    setInterval(()=>{

        connection.sendUTF('Hi, there!'+inc++);

    },0)


    connection.on('close',a=>console.log('CLOSED'))

    connection.on('error',console.log)
      
}