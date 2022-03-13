import http2 from 'http2'
import fs from 'fs'

const server = http2.createSecureServer({
  
    key: fs.readFileSync('KLY_Custom/dev/security/rsa4096-key.pem'),
  
    cert: fs.readFileSync('KLY_Custom/dev/security/rsa4096-cert.pem'),
  
    //Test mTLS
    //requestCert:true,
    //This is necessary only if the client uses a self-signed certificate.
    //ca: [ fs.readFileSync('KLY_Custom/dev/security/localcert.pem') ]

});


server.on('error', (err) => console.error(err));

server.on('stream', (stream,headers) => {

  console.log(headers)
  
  // stream is a Duplex
  stream.respond({
    'content-type': 'text/html; charset=utf-8',
    ':status': 200
  });
  stream.end('<h1>Hello World</h1>');
});

server.listen(8443,()=>console.log('Start'));


