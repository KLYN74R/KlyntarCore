import {BODY,BLAKE3} from '../KLY_Space/utils.js'

import {integrity} from '../klyn74r.js'

//Тут можно вместе с хабом проводить децентрализованную проверку на Global Accepted Rules и/или
//Решить с Integrity(проверка и совместное решение лишать или нет).Кстати сюда можно запихнуть децентрализацию проверки типов(против деоптимизации)



export let I={

/*Here may be everything-proofs of profies(signatures),integrity of state of news of nodes near
______________________________________Available prefixes______________________________________
    
    G1+NID-state of newsgroup of respectively node or node which is near with index 1 of etc.
    E1+NID-state of newsgroup from Information Empire of node which is near with index 1
    BC1+NID-hash or copy of branchcom 


    It can be deleted since time,so it's temporary proofs,it's not adding to blockchain as in the next way
Чтоб быть уверенным в целосности,то иногда на просьбу о помощи от создателя новостей берем из запроса новость,дальше делаем запрос на желаемый узел,если там 0 ответа,то не признаем,если в ответ группа,то проверем наличие соответствующей новости+хеш
Так можно на разных уровнях от локальных узлов,дальше запрос в Consorcium,которые делают тоже самое*/
    addIntegrity:a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>{}).onData(async v=>{
    
        let b=await BODY(v)
    
        CONFIG.NEAR.includes(b.c)
        &&
        BLAKE3()
        &&
        integrity.put(b.c+b.h,b.d).then(()=>a.end('OK')).catch(e=>a.end(''))
    
    }),
    

    //By hash
    branchcomIntegrity:a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>{}).onData(async v=>{
    
        let b=await BODY(v)
    
    }),
    



    newsIntegrity:a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>{}).onData(async v=>{
    
        let b=await BODY(v)
    
    }),
    



    storeIntegrity:a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>{}).onData(async v=>{
    
        let b=await BODY(v)
    
    }),
    



    likesIntegrity:a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>{}).onData(async v=>{
    
        let b=await BODY(v)
    
    })

}