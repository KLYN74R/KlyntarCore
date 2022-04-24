import {PATH_RESOLVE} from '../../../KLY_Utils/utils.js'
import {LOG} from '../../../KLY_Services/CommonResources/utils.js'
import {spawn} from 'child_process'


export default SERVICE_RUUNER=servicePath=>{

    LOG({data:`Received new service ${servicePath}`},'CD')

}