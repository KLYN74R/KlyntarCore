





//______________________________________________ SERVER ______________________________________________


import {LOG} from '../../KLY_Utils/utils.js'

import uWS from 'uWebSockets.js'


if(CONFIG.WSS.ENABLE){




    let {PORT,HOST,CERT,KEY}=CONFIG.WSS

    uWS.App({
  
        key_file_name: KEY,
        cert_file_name: CERT

    }).ws('/*',{
  
        /*Options*/
        compression: uWS.SHARED_COMPRESSOR,
        maxPayloadLength: 16 * 1024 * 1024,
        idleTimeout: 10,
  
        open:_=>LOG('A socket connected!','I'),
 
        message: (ws, message, isBinary) => {
        
            /* Ok is false if backpressure was built up, wait for drain */
            LOG(`WS server received ping => ${Buffer.from(message).toString('utf8')}`,'I')
            
            let ok = ws.send('PONG -> '+message,isBinary);
            
            console.log('OK ',ok)
        
        },
    
        drain:ws=>console.log('WebSocket backpressure: ' + ws.getBufferedAmount()),

        close: (ws, code, message) => console.log('WebSocket closed')


    }).any('/*',res=>{
    
      res.end('Nothing to see here!');

    }).listen(PORT,token=>LOG(token?`WSS available on \u001b[38;5;3m${HOST}:${PORT}`:'Failed to listen to combination of \u001b[38;5;3mHOST:PORT','I'))



}










//______________________________________________ CLIENT ______________________________________________




// import WS from 'websocket'



// // Создаётся экземпляр клиента
// var WebSocketClient = WS.client;
// var client = new WebSocketClient();

// // Вешаем на него обработчик события подключения к серверу
// client.on('connect', handler);

// // Подключаемся к нужному ресурсу
// client.connect('ws://localhost:9001/');


// function handler(connection) {
    
//     connection.on('message', function (message) {
//       // делаем что-нибудь с пришедшим сообщением
//       console.log('Client received ',message);
//     })
    
//     // посылаем сообщение серверу
//     let inc=0

//     setInterval(()=>{

//         connection.sendUTF('Hi, there!'+inc++);

//     },3000)


//     connection.on('close',a=>console.log('CLOSED'))
      
// }