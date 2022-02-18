import {PATH_RESOLVE} from '../../KLY_Space/utils.js'
import {exec} from 'child_process'

import {LOG} from '../CommonResources/utils.js'



LOG('Dummy example of ETH storage service','CD')



exec(PATH_RESOLVE(`KLY_Services/EthContractStorage/storage`), (err, stdout, stderr) => {
    
    //Node couldn"t execute the command  
    if (err) console.log(err)

    //The *entire* stdout and stderr (buffered)
    console.log(`${stdout}`)
    console.log(`${stderr}`)

})

