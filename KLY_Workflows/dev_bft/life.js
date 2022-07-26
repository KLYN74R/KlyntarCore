//You can define local functionality and so on
import { LOG } from './localUtils.js'



export let RUN_SYMBIOTE = () => {

    console.log('************ IMITATION OF RENAISSANCE************')
    console.log('You can skip if you don`t need')
    console.log('************ IMITATION OF RENAISSANCE************')

    import('./signalHandlers.js').catch(e=>console.log('HE'))

    setInterval(()=>LOG(`Validator ${CONFIG.SYMBIOTE[CURRENT_SYMBIOTE_ID]}`,'S',CURRENT_SYMBIOTE_ID),3000)

}