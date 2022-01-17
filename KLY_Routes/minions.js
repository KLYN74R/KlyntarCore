import {ACC_CONTROL,BODY,MINION} from '../KLY_Space/utils.js'




export let Z={


//Сюда про запросы на другие узлы,проверку Integrity и тд
//_____________________________________________________MINIONS____________________________________________________
    

    
    
    getResources:a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>{}).onData(async v=>{
            
        let b=await BODY(v,CONFIG.PAYLOAD_SIZE)
        
        if(typeof b.c==='string'&&typeof b.f==='string'&&await ACC_CONTROL(b.c,'1',b.f,1,0,MINION,0)){
    
        }else a.end('')
    
    }),
    
    
    
    
    minionsVerify:a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>{}).onData(async v=>{
        
        let b=await BODY(v,CONFIG.PAYLOAD_SIZE)
        
        if(typeof b.c==='string'&&typeof b.f==='string'&&await ACC_CONTROL(b.c,'1',b.f,1,0,MINION,0)){
    
        }else a.end('')
    
    }),
    
    


    ord:a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>{}).onData(async v=>{

        let b=await BODY(v,CONFIG.PAYLOAD_SIZE)

        if(typeof b.c==='string'&&typeof b.f==='string'&&await ACC_CONTROL(b.c,'1',b.f,1,0,MINION,0)){

        }else a.end('')

    })

}