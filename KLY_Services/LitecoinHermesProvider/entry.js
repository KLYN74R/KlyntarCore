import {PATH_RESOLVE} from '../../KLY_Utils/utils.js'
import {LOG} from '../CommonResources/utils.js'
import {spawn} from 'child_process'


let service

try{
    
    service = spawn('node',[PATH_RESOLVE(`KLY_Services/LitecoinHermesProvider/serv.js`)])


    service.stdout.on('data',data=>LOG({data:data+'',pid:service.pid},'CD'))

    service.stderr.on('error',data=>LOG({data:data+'',pid:service.pid},'CD'))
  
    service.on('close',data=>LOG({data:data+'',pid:service.pid},'CD'))


}catch(e){


}