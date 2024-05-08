import {LOG} from '../../KLY_Services/CommonResources/utils.js'
import {LOG as UTIL_LOG} from '../../KLY_Utils/utils.js'
import {pathResolve} from '../../KLY_Utils/utils.js'
import Docker from 'dockerode'
import fs from 'fs'




/*


                     █████╗ ███╗   ██╗██████╗ ██████╗  ██████╗ ███╗   ███╗███████╗██████╗  █████╗ 
                    ██╔══██╗████╗  ██║██╔══██╗██╔══██╗██╔═══██╗████╗ ████║██╔════╝██╔══██╗██╔══██╗
                    ███████║██╔██╗ ██║██║  ██║██████╔╝██║   ██║██╔████╔██║█████╗  ██║  ██║███████║
                    ██╔══██║██║╚██╗██║██║  ██║██╔══██╗██║   ██║██║╚██╔╝██║██╔══╝  ██║  ██║██╔══██║
                    ██║  ██║██║ ╚████║██████╔╝██║  ██║╚██████╔╝██║ ╚═╝ ██║███████╗██████╔╝██║  ██║
                    ╚═╝  ╚═╝╚═╝  ╚═══╝╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚═╝╚══════╝╚═════╝ ╚═╝  ╚═╝

*********************************************************************************************************************
                                                                                                                    *
                                The most default,native services runner for KLYNTAR_0                               *
                                                                                                                    *
                                                by KlyntarTeam                                                      *
                                                                                                                    *
                                                    v0.1.0                                                          *
                                                                                                                    *
*********************************************************************************************************************


[25.04.-01]

The most default initial runner used by KlyntarTeam to allow you to run services following by rules defined in configuration
Use host(current runtime/another process) and virtual environment(docker in this case) to give you maximum abilities to dynamically change everything you need

[FORMAT]

============================= REQUIRED =============================

this.desc=desc,             //Describe your service in a few words.Minimum network size is 200 symbols
        
this.toolchain=toolchain,   //['docker','node.js'] - define toolchain and everything what your service are required
    
this.type=type,             //'self/git',
        
this.keywords=keywords,     //array of keywords for better recognition

this.payload=payload        //hex of service or link to repository/arhive to load service


============================= OPTIONAL =============================

this.symbiotes?             //array of symbiotes if service rely on them

this.hostchains?            //hostchains to interact with

this.dec_storage?           //does this service hosted somewhere in decentralized space

*/

let RUNNER_CONFIGS=JSON.parse(fs.readFileSync(pathResolve('KLY_Runners/dev_andromeda/configs.json')))

let docker = new Docker(RUNNER_CONFIGS.DOCKER_CONFIGS)//https://www.npmjs.com/package/dockerode - use to check the configs 

// docker.listContainers().then(console.log)



export default async service=>{

    if(typeof service.title==='string' && service.desc.length<RUNNER_CONFIGS.DESC_MAX_LEN){

        LOG({data:`Received new service \x1b[31;1m${service.desc}\x1b[0m`,pid:process.pid},'CD')

    }

    
}


//____________________________________________________________ RUNNING SERVICES ____________________________________________________________

    

let servicesToRun = RUNNER_CONFIGS.SERVICES_TO_RUN


UTIL_LOG(fs.readFileSync(pathResolve('images/events/services.txt')).toString(),'CD')

if(Object.keys(servicesToRun).length){

    Object.keys(servicesToRun).forEach(
        
        servicePath => UTIL_LOG(`Service \x1b[36;1m${servicePath}\u001b[38;5;168m will be runned \u001b[38;5;168m(\x1b[36;1m${servicesToRun[servicePath]}\u001b[38;5;168m)`,'CON')
            
    )
    
}else UTIL_LOG('No services will be runned','I')



for(let servicePath in servicesToRun){

    import(`../../KLY_Services/${servicePath}/entry.js`).catch(
        
        e => UTIL_LOG(`Some error has been occured in process of service \u001b[38;5;50m${servicePath}\x1b[31;1m load\n${e}\n`,'F')
        
    )

}





/*


___________________________________________________________________ LINKS POOL ___________________________________________________________________

https://gist.github.com/styblope/dc55e0ad2a9848f2cc3307d4819d819fs - for Linux






*/
