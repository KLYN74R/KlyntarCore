/**
 * 
 * @Vlad@ Chernenko 19.08.-1
 * 
 * 
 * Test to get new state of chain after period of being offline
 * Probably it requires to transfer large chanks of data per each chain
 * BTW you can load state from any place you want
 * 
 * But as default-it's Controller
 * 
 * 
 * For test I've used database which describes state for 5 millions accounts
 * So,we transfer state of 5M of accounts as response
 * 
 */


//_________________________________________________________KIND OF SERVER SIDE_________________________________________________________

import UWS from 'uWebSockets.js'
import fs from 'fs'


// await new Promise((resolve,reject)=>{

//     db.createReadStream().on('data',v=>ctr++).on('end',()=>resolve(ctr))

// }).then(x=>console.log('AFTER PROMISE -> ',ctr))







let currentIndex=0,stopQuant=false


//To imitate realtime changes(make copy of state)
setInterval(()=>{
    
    stopQuant=!stopQuant

    console.log('NOW -> ',stopQuant,' -> ',++currentIndex)

},10000)


//Imitation of simple server
UWS.App().get(state',res=>{

    if(!stopQuant){

        let aborted=false//if connection was aborted
    
        res.onAborted(()=>{
            
            aborted=true
            console.log('Connection aborted')
            stateStream.emit('end','End session')
    
        })

    
        //Start read stream
        let stateStream=fs.createReadStream('STOR.json').on('data',chunk=>
    
            !aborted&&res.write(chunk)//call .end when rewrite collapse
        
        ).on('end',val=>val?console.log(val):!aborted&&res.end(''))//end reading and close connection

    }else a.end('CHAIN NOT SUPPORTED')

})

.get(data',a=>a.end(JSON.stringify({stopQuant,currentIndex})))


.listen(9001,ok=>ok&&console.log('Started on 9001'))




//_________________________________________________________KIND OF CLIENT SIDE_________________________________________________________




let initRequest=(label,streamName)=>{
    
    console.time(label)

    fetch("http://localhost:9001/state").then(res=>
    
        new Promise((resolve,reject)=>{

            let dest = fs.createWriteStream(`TEMP/${streamName}`)
            
            res.body.pipe(dest)
            
            res.body.on("end",()=>resolve("Success"))
            
            dest.on("error",reject)
        
        })
        
    ).then(v=>{
        
        console.log(v)
        console.timeEnd(label)
    
    }).catch(e=>{console.log(`Oops,some problem ${e}`);process.exit()})

}


//Start 3 streams(client imitation) to get 10M acccounts per each stream
//initRequest('A','amazing.json')
// initRequest('B','hello.json')
// initRequest('C','world.json')