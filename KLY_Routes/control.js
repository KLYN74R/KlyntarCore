/**
 * Сказать что это все эти 2 FA и тд не будут нужны в будущем при наличии квантовых каналов связи
 * Потому что если рассчитывать безопасность в неких X единицах,то QKD=100%(тоесть ∞).При наличии него мы нуждаемся только в аутентификации(по драфту того алгоритма что я говорил)
 * 
 */

import {LOG,VERIFY,HMAC} from '../KLY_Space/utils.js'


let SELF_2FA=async(str,fullHash,sig)=>HMAC(std,CONFIG.CONTROL_SID,W.nonce,fullHash)&&(!CONFIG.DOUBLE_FA || await VERIFY(str,sig,CONFIG.CONTROL_PUB_KEY))


//CONTROL_SID
//CONTROL_PRV_KEY
export let W={

    nonce:0,

    ls:'SOME GUID',

    config:a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>{}).onData(async bytes=>{

        let b=await BODY(bytes,CONFIG.PAYLOAD_SIZE)

    
    })

}
    
