//For communications User -> Node
import {BLAKE3} from '../KLY_Space/utils.js'

export default class{

    constructor(pub,data,sid){

        let timestamp=new Date().getTime()
        
        this.c=pub

        this.d=data

        this.t=timestamp

        this.f=BLAKE3(typeof data!=='object'?data:JSON.stringify(data)+sid+timestamp)

    }
    
}