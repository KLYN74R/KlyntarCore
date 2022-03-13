import http2 from 'http2'
import fs from 'fs'




let configs=JSON.parse(fs.readFileSync('KLY_Custom/dev/http2/config.json'))


const server = http2.createSecureServer({
  
    key: fs.readFileSync(configs.TLS_KEY),
  
    cert: fs.readFileSync(configs.TLS_CERT),
  
    //Test mTLS
    requestCert:configs.mTLS,
    
    //This is necessary only if the client uses a self-signed certificate.
    ca: [ fs.readFileSync(configs.mTLS_CA) ]

})



server.on('error',console.error)


server.on('stream',(stream,_headers) => {
  
    //stream is a Duplex
    stream.respond({
        'content-type': 'text/html; charset=utf-8',
        ':status': 200
    })
  
    stream.end('<h1>Hello World</h1>')

})


server.listen(configs.PORT,configs.HOST,()=>console.log(`HTTPS started on ${configs.HOST}:${configs.PORT}`))