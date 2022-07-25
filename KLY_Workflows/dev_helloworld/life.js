//You can define local functionality and so on
import { LOG } from './localUtils.js'




export let PREPARE_SYMBIOTE = symbioteID => {

    console.log('************ IMITATION OF PREPARATIONS************')
    console.log('You can skip if you don`t need')
    console.log('************ IMITATION OF RENAISSANCE************')

    import('./signalHandlers.js').catch(e=>console.log('HE'))

}


export let RENAISSANCE = symbioteID => {

    console.log('************ IMITATION OF RENAISSANCE************')
    console.log('You can skip if you don`t need')
    console.log('************ IMITATION OF RENAISSANCE************')

    setInterval(()=>LOG('Hello World from dev_helloworld !!!','S',CURRENT_SYMBIOTE_ID),CONFIG.SYMBIOTE.HELLO_WORLD_TIMEOUT)

}