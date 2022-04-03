import http2 from 'http2'
import fs from 'fs'


const client = http2.connect('https://127.0.0.1:7979', {

    //To use self signed TLS certificates
    ca: fs.readFileSync('C:/Users/Acer/MyProjects/Klyntar/KlyntarCore/KLY_Custom/dev/security/ip.crt'),
  
    //For mTLS
    //key:fs.readFileSync('KLY_Custom/dev/security/localkey.pem'),
    //cert:fs.readFileSync('KLY_Custom/dev/security/localcert.pem')

});


client.on('error', (err) => console.error(err));

const req = client.request({ ':path': '/' });

req.on('response', (headers, flags) => {
  for (const name in headers) {
    console.log(`${name}: ${headers[name]}`);
  }
});

req.setEncoding('utf8');
let data = '';
req.on('data', (chunk) => { data += chunk; });
req.on('end', () => {

  console.log('Received data')

  console.log(`\n${data}`);
  client.close();
});
req.end();