





//______________________________________________ SERVER ______________________________________________


import uWS from 'uWebSockets.js'


let connections=[]


let app = uWS.App({
  
        key_file_name: '',
        cert_file_name: ''

    }).ws('/*',{
  
        /*Options*/
        compression: uWS.SHARED_COMPRESSOR,
        maxPayloadLength: 16 * 1024 * 1024,
        idleTimeout: 10,
  
        open:ws=>{

            console.log(`A socket connected! ${Buffer.from(ws.getRemoteAddress()).toString('utf-8')}`,'I')
            
            connections.push(ws)

            ws.subscribe('AAA')

        },
 
        message: (ws, message, isBinary) => {
        
            /* Ok is false if backpressure was built up, wait for drain */
            console.log(`WS server received ping => ${Buffer.from(message).toString('utf8')} from ${ws.getRemoteAddressAsText()}`,'I')
            
            let ok = ws.send('PONG -> '+message,isBinary);
            
        
        },
    
        drain:ws=>console.log('WebSocket backpressure: ' + ws.getBufferedAmount()),

        close: (ws, code, message) => console.log('WebSocket closed')


    }).listen(9999,token=>console.log(token?`WSS available on \u001b[38;5;3m${'0.0.0.0'}:${9999}`:'Failed to listen to combination of \u001b[38;5;3mHOST:PORT','I'))


// setInterval(()=>{
    
//     app.publish('AAA',JSON.stringify({block:'AAA'}))
    
//     console.log(`Total subs for AAA`,app.numSubscribers('AAA'))

// },3000)






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