import {PATH_RESOLVE} from '../../KLY_Utils/utils.js'
import {LOG} from '../CommonResources/utils.js'
import { spawn } from 'child_process'





let service = spawn(PATH_RESOLVE(`KLY_Services/EthContractStorage/storage`))



service.stdout.on('data',data=>LOG({data:data+'',pid:service.pid},'CD'))

service.stderr.on('error',data=>LOG({data:data+'',pid:service.pid},'CD'))
  
service.on('close',data=>LOG({data:data+'',pid:service.pid},'CD'))