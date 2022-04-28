#!/usr/bin/env node

import {SYMBIOTE_ALIAS,LOG,PATH_RESOLVE,CHECK_UPDATES} from './KLY_Utils/utils.js'

import {RENAISSANCE,PREPARE_SYMBIOTE} from './KLY_Workflow/dev@controller/life.js'

import chalkAnimation from 'chalk-animation'

import UWS from 'uWebSockets.js'

import readline from 'readline'

import fs from 'fs'

import os from 'os'



process.env.UV_THREADPOOL_SIZE = process.env.KLYNTAR_THREADPOOL_SIZE || process.env.NUMBER_OF_PROCESSORS



/*

_______________OBLIGATORY PATH RESOLUTION_______________


✔️Sets the absolute path over relative one

🔗Used to allow us to link and start deamon from everywhere

😈Also,to prevent different attacks e.g. search order hijacking,modules substitution,NPM hijacking etc.
prevent privilleges escalation via path misconfiguration or lack of access control.

*/
global.__dirname = await import('path').then(async mod=>
  
    mod.dirname(
      
      (await import('url')).fileURLToPath(import.meta.url)
      
    )

)


/*


TODO:Над процессом принятия и обработки блока + при включении
TODO:Реализация функционала симбиотических цепочек(отправка+проверка)

+TODO:Работать над приемом и распространением блоков
*TODO:Provide async formatting ratings due to fair addresses and liars
!TODO:Что делать с цепочками которые только-только появились
!TODO:Ограничить время TCP сессии для fetch(через Promise.any и один из промисов таймер на заданое кол-во секунд)


                                            


                                .do-"""""'-o..                         
                             .o""            ""..                       
                           ,,''                 ``b.                   
                          d'                      ``b                   
                         d`d:                       `b.                 
                        ,,dP                         `Y.               
                       d`88                           `8.               
 ooooooooooooooooood888`88'                            `88888888888bo, 
d"""    `""""""""""""Y:d8P                              8,          `b 
8                    P,88b                             ,`8           8 
8                   ::d888,                           ,8:8.          8                              ██████╗ ███████╗██╗   ██╗███████╗██╗      ██████╗ ██████╗ ███████╗██████╗ 
:                   dY88888                           `' ::          8                              ██╔══██╗██╔════╝██║   ██║██╔════╝██║     ██╔═══██╗██╔══██╗██╔════╝██╔══██╗ 
:                   8:8888                               `b          8                              ██║  ██║█████╗  ██║   ██║█████╗  ██║     ██║   ██║██████╔╝█████╗  ██║  ██║    
:                   Pd88P',...                     ,d888o.8          8                              ██║  ██║██╔══╝  ╚██╗ ██╔╝██╔══╝  ██║     ██║   ██║██╔═══╝ ██╔══╝  ██║  ██║  
:                   :88'dd888888o.                d8888`88:          8                              ██████╔╝███████╗ ╚████╔╝ ███████╗███████╗╚██████╔╝██║     ███████╗██████╔╝   
:                  ,:Y:d8888888888b             ,d88888:88:          8                              ╚═════╝ ╚══════╝  ╚═══╝  ╚══════╝╚══════╝ ╚═════╝ ╚═╝     ╚══════╝╚═════╝
:                  :::b88d888888888b.          ,d888888bY8b          8                              
                    b:P8;888888888888.        ,88888888888P          8                              
                    8:b88888888888888:        888888888888'          8                              
                    8:8.8888888888888:        Y8888888888P           8                              ███████╗ ██████╗ ██████╗     ██████╗ ███████╗ ██████╗ ██████╗ ██╗     ███████╗     
,                   YP88d8888888888P'          ""888888"Y            8                              ██╔════╝██╔═══██╗██╔══██╗    ██╔══██╗██╔════╝██╔═══██╗██╔══██╗██║     ██╔════╝  
:                   :bY8888P"""""''                     :            8                              █████╗  ██║   ██║██████╔╝    ██████╔╝█████╗  ██║   ██║██████╔╝██║     █████╗  
:                    8'8888'                            d            8                              ██╔══╝  ██║   ██║██╔══██╗    ██╔═══╝ ██╔══╝  ██║   ██║██╔═══╝ ██║     ██╔══╝    
:                    :bY888,                           ,P            8                              ██║     ╚██████╔╝██║  ██║    ██║     ███████╗╚██████╔╝██║     ███████╗███████╗   
:                     Y,8888           d.  ,-         ,8'            8                              ╚═╝      ╚═════╝ ╚═╝  ╚═╝    ╚═╝     ╚══════╝ ╚═════╝ ╚═╝     ╚══════╝╚══════╝
:                     `8)888:           '            ,P'             8                              
:                      `88888.          ,...        ,P               8                              
:                       `Y8888,       ,888888o     ,P                8                              ██████╗ ██╗   ██╗    ██╗  ██╗██╗  ██╗   ██╗███╗   ██╗████████╗ █████╗ ██████╗     ████████╗███████╗ █████╗ ███╗   ███╗
:                         Y888b      ,88888888    ,P'                8                              ██╔══██╗╚██╗ ██╔╝    ██║ ██╔╝██║  ╚██╗ ██╔╝████╗  ██║╚══██╔══╝██╔══██╗██╔══██╗    ╚══██╔══╝██╔════╝██╔══██╗████╗ ████║
:                          `888b    ,888888888   ,,'                 8                              ██████╔╝ ╚████╔╝     █████╔╝ ██║   ╚████╔╝ ██╔██╗ ██║   ██║   ███████║██████╔╝       ██║   █████╗  ███████║██╔████╔██║
:                           `Y88b  dPY888888OP   :'                  8                              ██╔══██╗  ╚██╔╝      ██╔═██╗ ██║    ╚██╔╝  ██║╚██╗██║   ██║   ██╔══██║██╔══██╗       ██║   ██╔══╝  ██╔══██║██║╚██╔╝██║
:                             :88.,'.   `' `8P-"b.                   8                              ██████╔╝   ██║       ██║  ██╗███████╗██║   ██║ ╚████║   ██║   ██║  ██║██║  ██║       ██║   ███████╗██║  ██║██║ ╚═╝ ██║
:.                             )8P,   ,b '  -   ``b                  8                              ╚═════╝    ╚═╝       ╚═╝  ╚═╝╚══════╝╚═╝   ╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝       ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝
::                            :':   d,'d`b, .  - ,db                 8                              
::                            `b. dP' d8':      d88'                 8                              
::                             '8P" d8P' 8 -  d88P'                  8                              
::                            d,' ,d8'  ''  dd88'                    8                              
::                           d'   8P'  d' dd88'8                     8                              
 :                          ,:   `'   d:ddO8P' `b.                   8                              
 :                  ,dooood88: ,    ,d8888""    ```b.                8                              
 :               .o8"'""""""Y8.b    8 `"''    .o'  `"""ob.           8                              
 :              dP'         `8:     K       dP''        "`Yo.        8                              
 :             dP            88     8b.   ,d'              ``b       8                              
 :             8.            8P     8""'  `"                 :.      8                              ██╗   ██╗   ██████╗  
 :            :8:           :8'    ,:                        ::      8                              ██║   ██║  ██╔════╝ 
 :            :8:           d:    d'                         ::      8                              ██║   ██║  ██║   
 :            :8:          dP   ,,'                          ::      8                              ╚██╗ ██╔╝  ██║ 
 :            `8:     :b  dP   ,,                            ::      8                               ╚████╔╝██╗╚██████╗██╗     
 :            ,8b     :8 dP   ,,                             d       8                                ╚═══╝ ╚═╝ ╚═════╝╚═╝ 
 :            :8P     :8dP    d'                       d     8       8 
 :            :8:     d8P    d'                      d88    :P       8 
 :            d8'    ,88'   ,P                     ,d888    d'       8 
 :            88     dP'   ,P                      d8888b   8        8 
 '           ,8:   ,dP'    8.                     d8''88'  :8        8 
             :8   d8P'    d88b                   d"'  88   :8        8 
             d: ,d8P'    ,8P""".                      88   :P        8 
             8 ,88P'     d'                           88   ::        8 
            ,8 d8P       8                            88   ::        8 
            d: 8P       ,:  -hrr-                    :88   ::        8 
            8',8:,d     d'                           :8:   ::        8 
           ,8,8P'8'    ,8                            :8'   ::        8 
           :8`' d'     d'                            :8    ::        8 
           `8  ,P     :8                             :8:   ::        8 
            8, `      d8.                            :8:   8:        8 
            :8       d88:                            d8:   8         8 
 ,          `8,     d8888                            88b   8         8 
 :           88   ,d::888                            888   Y:        8 
 :           YK,oo8P :888                            888.  `b        8 
 :           `8888P  :888:                          ,888:   Y,       8 
 :            ``'"   `888b                          :888:   `b       8 
 :                    8888                           888:    ::      8 
 :                    8888:                          888b     Y.     8, 
 :                    8888b                          :888     `b     8: 
 :                    88888.                         `888,     Y     8: 
 ``ob...............--"""""'----------------------`""""""""'"""`'"""""

*/




//_________________________________________________CONSTANTS_POOL_______________________________________________




//Check the Roadmap,documentation,official sources,etc. to get more | Смотрите Roadmap проекта,документацию,официальные источники и тд. чтобы узнать больше

export let

    symbiotes=new Map(),//Mapping(CONTROLLER_ADDRESS(ex.FASj1powx5qF1J6MRmx1PB7NQp5mENYEukhyfaWoqzL9)=>{BLOCKS:DB_INSTANCE,STATE:DB_INSTANCE,...})
    
    hostchains=new Map(),//To integrate with other explorers,daemons,API,gateways,NaaS etc.

    WRAP_RESPONSE=(a,ttl)=>a.writeHeader('Access-Control-Allow-Origin','*').writeHeader('Cache-Control','max-age='+ttl)











    
//_________________________________________________CONFIG_PROCESS_______________________________________________


//Define globally
global.CONFIG={}


//Load all the configs
fs.readdirSync(PATH_RESOLVE('configs')).forEach(file=>
    
    Object.assign(CONFIG,JSON.parse(fs.readFileSync(PATH_RESOLVE(`configs/${file}`))))
    
)


//To allow you to run multiple KLYNTAR instances
process.argv.slice(2).forEach(
    
    overrideJson => {

        let obj=JSON.parse(fs.readFileSync(overrideJson))

        Object.assign(CONFIG,obj)

    }
    
)


//*********************** SET HANDLERS ON USEFUL SIGNALS ************************


let graceful=()=>{
    
    SIG_SIGNAL=true


    console.log('\n')

    LOG('Klyntar stop has been initiated.Keep waiting...','I')
    
    LOG(fs.readFileSync(PATH_RESOLVE('images/events/termination.txt')).toString(),'W')
    
    //Probably stop logs on this step
    setInterval(async()=>{

        //Each subprocess in each symbiote must be stopped
        if(Object.keys(SIG_PROCESS).every(symbiote => Object.values(SIG_PROCESS[symbiote]).every(x=>x))){

            console.log('\n')

            let streamsPromises=[]

            SYMBIOTES_LOGS_STREAMS.forEach(
                
                (stream,symbiote) => streamsPromises.push(
                    
                    new Promise( resolve => stream.close( e => {

                        LOG(`Logging was stopped for ${SYMBIOTE_ALIAS(symbiote)} ${e?'\n'+e:''}`,'I')

                        resolve()
                    
                    }))
                    
                )
                
            )



            LOG('Server stopped','I')

            global.UWS_DESC&&UWS.us_listen_socket_close(UWS_DESC)



            await Promise.all(streamsPromises).then(_=>{

                LOG('Node was gracefully stopped','I')
                
                process.exit(0)

            })

        }

    },200)

}



//Define listeners on typical signals to safely stop the node
process.on('SIGTERM',graceful)
process.on('SIGINT',graceful)
process.on('SIGHUP',graceful)


//************************ END SUB ************************



//________________________________________________SHARED RESOURCES______________________________________________




global.SYMBIOTES_LOGS_STREAMS=new Map()

global.PRIVATE_KEYS=new Map()

global.SIG_SIGNAL=false

global.SIG_PROCESS={}




//Location for symbiotes
!fs.existsSync(PATH_RESOLVE('C')) && fs.mkdirSync(PATH_RESOLVE('C'));

//For logs streams
!fs.existsSync(PATH_RESOLVE(`LOGS`)) && fs.mkdirSync(PATH_RESOLVE(`LOGS`));

//And for snapshots
!fs.existsSync(PATH_RESOLVE(`SNAPSHOTS`)) && fs.mkdirSync(PATH_RESOLVE(`SNAPSHOTS`));




/*
****************************************************************************************************************
*                                                                                                              *
*                                                                                                              *
*                                    ░██████╗████████╗░█████╗░██████╗░████████╗                                *
*                                    ██╔════╝╚══██╔══╝██╔══██╗██╔══██╗╚══██╔══╝                                *
*                                    ╚█████╗░░░░██║░░░███████║██████╔╝░░░██║░░░                                *
*                                    ░╚═══██╗░░░██║░░░██╔══██║██╔══██╗░░░██║░░░                                *
*                                    ██████╔╝░░░██║░░░██║░░██║██║░░██║░░░██║░░░                                *
*                                    ╚═════╝░░░░╚═╝░░░╚═╝░░╚═╝╚═╝░░╚═╝░░░╚═╝░░░                                *
*                                                                                                              *
*                                                                                                              *
****************************************************************************************************************
*/




(async()=>{




//_________________________________________________BANNERS INTRO________________________________________________




    process.stdout.write('\x1Bc')
    
    //Cool short animation
    await new Promise(r=>{
        
        let animation=chalkAnimation.glitch('\x1b[31;1m'+fs.readFileSync(PATH_RESOLVE('images/intro.txt')).toString()+'\x1b[0m')
    
        setTimeout(()=>{ animation.stop() ; r() },CONFIG.PRELUDE.ANIMATION_DURATION)
    
    })
    
    
    process.stdout.write('\x1Bc')
    
    //Read banner
    console.log('\x1b[36;1m'+fs.readFileSync(PATH_RESOLVE('images/banner.txt')).toString()
    
    //...and add extra colors & changes)
    .replace('Made on Earth for Universe','\x1b[31mMade on Earth for Universe\x1b[36m')
    .replace('REMEMBER:To infinity and beyond!','\x1b[31mREMEMBER:To infinity and beyond!\x1b[36m')
    .replace('@ Powered by Klyntar @','@ Powered by \u001b[7m\u001b[31;5;219mKlyntar\x1b[0m \x1b[36;1m@')
    .replaceAll('≈','\x1b[31m≈\x1b[36m')
    .replaceAll('#','\x1b[31m#\x1b[36m')+'\x1b[0m\n')
    
    

    
    LOG(`System info \x1b[31m${['node:'+process.version,`info:${process.platform+os.arch()} # ${os.version()} # threads_num:${process.env.UV_THREADPOOL_SIZE}/${os.cpus().length}`,`role:${CONFIG.ROLE}(runned as ${os.userInfo().username})`,`galaxy:${CONFIG.GALAXY}`].join('\x1b[36m / \x1b[31m')}`,'I')

    LOG(fs.readFileSync(PATH_RESOLVE('images/events/start.txt')).toString(),'S')
    
    


//_____________________________________________ADVANCED PREPARATIONS____________________________________________




    //If some chain marked as "STOP",we don't prepare something for it,otherwise-force preparation work
    let controllers=Object.keys(CONFIG.SYMBIOTES)



    
    //.forEach has inner scope,but we need await on top frame level
    for(let i=0;i<controllers.length;i++) !CONFIG.SYMBIOTES[controllers[i]].STOP_WORK  &&  await PREPARE_SYMBIOTE(controllers[i])
    


    //Make this shit for memoization and not to repeate .stringify() within each request.Some kind of caching
    //BTW make it global to dynamically change it in the onther modules
    global.INFO=JSON.stringify(CONFIG.INFO)
    



//____________________________________________ASK FOR FINAL AGREEMENT____________________________________________




    console.log('\n\n\n')
    
    LOG(fs.readFileSync(PATH_RESOLVE('images/events/serverConfigs.txt')).toString().replaceAll('@','\x1b[31m@\x1b[32m').replaceAll('Check the configs carefully','\u001b[38;5;50mCheck the configs carefully\x1b[32m'),'S')

    LOG(`\u001b[38;5;202mTLS\u001b[38;5;168m is \u001b[38;5;50m${CONFIG.TLS.ENABLED?'enabled':'disabled'}`,'CON')
    
    await CHECK_UPDATES()

    LOG(`Server configuration is ———> \u001b[38;5;50m[${CONFIG.INTERFACE}]:${CONFIG.PORT}`,'CON')

    LOG(`Runned plugins(${CONFIG.PLUGINS.length}) are ———> \u001b[38;5;50m${CONFIG.PLUGINS.join(' \u001b[38;5;202m<>\u001b[38;5;50m ')}`,'CON')


    
    //Info about runned services
    console.log('\n\n')
    
    LOG(fs.readFileSync(PATH_RESOLVE('images/events/services.txt')).toString(),'CD')

    Object.keys(CONFIG.SERVICES).forEach(
        
        servicePath => LOG(`Service \x1b[36;1m${servicePath}\u001b[38;5;168m will be runned \u001b[38;5;168m(\x1b[36;1m${CONFIG.SERVICES[servicePath]}\u001b[38;5;168m)`,'CON')
        
    )


    LOG(fs.readFileSync(PATH_RESOLVE('images/events/external.txt')).toString(),'CD')

    Object.keys(CONFIG.EXTERNAL_SERVICES).forEach(
        
        servicePath => LOG(`External service \x1b[36;1m${servicePath}\u001b[38;5;168m will be runned \u001b[38;5;168m(\x1b[36;1m${CONFIG.EXTERNAL_SERVICES[servicePath]}\u001b[38;5;168m)`,'CON')
        
    )



    !CONFIG.PRELUDE.OPTIMISTIC
    &&
    await new Promise(resolve=>
        
        readline.createInterface({input:process.stdin, output:process.stdout, terminal:false})
    
        .question(`\n ${'\u001b[38;5;23m'}[${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]${'\x1b[36;1m'}  Do you agree with the current configuration? Enter \x1b[32;1mYES\x1b[36;1m to continue ———> \x1b[0m`,resolve)
        
    ).then(answer=>answer!=='YES'&& process.exit(126))


    //Run custom modules
    //To load them one by one,use top level await,so we need "for...of"
    for(let scriptPath of CONFIG.PLUGINS){

        //Tag:ExecMap
        import(`./KLY_Plugins/${scriptPath}`).catch(
            
            e => LOG(`Some error has been occured in process of plugin \u001b[38;5;50m${scriptPath}\x1b[31;1m load\n${e}\n`,'F')
            
        )

    }
    

    for(let servicePath in CONFIG.SERVICES){

        //Tag:ExecMap
        import(`./KLY_Services/${servicePath}/entry.js`).catch(
            
            e => LOG(`Some error has been occured in process of service \u001b[38;5;50m${servicePath}\x1b[31;1m load\n${e}\n`,'F')
            
        )

    }

    for(let servicePath in CONFIG.EXTERNAL_SERVICES){

        //Tag:ExecMap
        import(`./KLY_ExternalServices/${servicePath}/entry.js`).catch(
            
            e => LOG(`Some error has been occured in process of external service \u001b[38;5;50m${servicePath}\x1b[31;1m load\n${e}\n`,'F')
            
        )

    }


    //Get urgent state and go on!
    await RENAISSANCE()




//_______________________________________________GET SERVER ROUTES______________________________________________




//Load route modules
let CONTROL=(await import('./KLY_Routes/control.js')).default,
    
    MAIN=(await import('./KLY_Routes/main.js')).default,
    
    API=(await import('./KLY_Routes/api.js')).default,

    SERVICES=(await import('./KLY_Routes/services.js')).default




//_____________________________________________________MAIN_____________________________________________________

//...And only after that we start routes

//Tag:ExecMap
UWS[CONFIG.TLS.ENABLED?'SSLApp':'App'](CONFIG.TLS.CONFIGS)




.post('/cb',MAIN.controllerBlock)

.post('/ib',MAIN.instantBlock)

.post('/addnode',MAIN.addNode)

.post('/proof',MAIN.proof)

.post('/event',MAIN.event)




//_____________________________________________________CONTROL_____________________________________________________


//.post('/change',W.change)

.post('/con',CONTROL.config)

//.post('/view',W.view)


//_______________________________________________________API_______________________________________________________




.get('/multiplicity/:symbiote/:fromHeigth',API.multiplicity)

.get('/account/:symbiote/:address',API.acccount)

.get('/block/:symbiote/:type/:id',API.block)

.get('/nodes/:symbiote/:region',API.nodes)

.post('/alert',API.alert)

.get('/i',API.info)




//_____________________________________________________SERVICES____________________________________________________


.post('/service',SERVICES.services)




.listen(CONFIG.INTERFACE,CONFIG.PORT,descriptor=>{


    if(descriptor){

        LOG(`Node started on ———> \x1b[36;1m[${CONFIG.INTERFACE}]:${CONFIG.PORT}`,'S')

        global.UWS_DESC=descriptor
        
    }
    else LOG('Oops,some problems with server module','F')



})




})()