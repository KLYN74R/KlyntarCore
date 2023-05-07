//You can define local functionality and so on
import { LOG } from './localUtils.js'




export let RUN_SYMBIOTE = () => {

    import('./signalHandlers.js').catch(_=>console.log('HE'))

    console.log('************ IMITATION OF RUNNING ************')
    console.log('You can skip if you don`t need')
    console.log('************ IMITATION OF RUNNING ************')

    setInterval(()=>LOG('Hello World from dev_helloworld !!!','S',global.CONFIG.SYMBIOTE.SYMBIOTE_ID),global.CONFIG.SYMBIOTE.HELLO_WORLD_TIMEOUT)

}