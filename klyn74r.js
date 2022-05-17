#!/usr/bin/env node

/**
 * 
 * 
 * 
 * 
 * 
 *                                                               ██╗  ██╗██╗  ██╗   ██╗███╗   ██╗████████╗ █████╗ ██████╗ 
 *                                                               ██║ ██╔╝██║  ╚██╗ ██╔╝████╗  ██║╚══██╔══╝██╔══██╗██╔══██╗
 *                                                               █████╔╝ ██║   ╚████╔╝ ██╔██╗ ██║   ██║   ███████║██████╔╝
 *                                                               ██╔═██╗ ██║    ╚██╔╝  ██║╚██╗██║   ██║   ██╔══██║██╔══██╗
 *                                                               ██║  ██╗███████╗██║   ██║ ╚████║   ██║   ██║  ██║██║  ██║
 *                                                               ╚═╝  ╚═╝╚══════╝╚═╝   ╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝
 * 
 * 
 * 
 *                                                               Developed on Earth,Milky Way(Sagittarius A*) by humanity
 * 
 * 
 *                                                                          Date: ~66.5 ml after Chicxulub
 * 
 * 
 *                                                                          Dev:Vlad Chernenko(@V14D4RT3M)
 * 
 * 
 *                                                       ⟒10⏚19⎎12⟒33⏃☊0⟒⟒⏚401⎅671⏚⏃23⟒38899⎎⎅387847183☊⎅6⏚8308⏃☊72⎅511⏃⏚
 * 
 * 
 * 
 * 
 * 
 * 
 */

import {SYMBIOTE_ALIAS,LOG,PATH_RESOLVE} from './KLY_Utils/utils.js'

import chalkAnimation from 'chalk-animation'

import UWS from 'uWebSockets.js'

import {isAbsolute} from 'path'

import readline from 'readline'

import fs from 'fs'

import os from 'os'




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

//______INITIALLY,LET'S COPE WITH ENV VARIABLES_________




process.env.UV_THREADPOOL_SIZE = process.env.KLYNTAR_THREADPOOL_SIZE || process.env.NUMBER_OF_PROCESSORS




//____________________SET MODE__________________________

//All symbiotes are runned in a single instance as mainnets
process.env.KLY_MODE||='main'


if(process.env.KLY_MODE!=='main' && process.env.KLY_MODE!=='test'){

    console.log(`\u001b[38;5;202m[${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]\u001b[38;5;99m(pid:${process.pid})\x1b[36;1m Unrecognized mode \x1b[32;1m${process.env.KLY_MODE}\x1b[0m\x1b[36;1m(choose 'test' for AntiVenom testnet or 'main' for your symbiotes)\x1b[0m`)

    process.exit(1)

}

//GLOBAL_DIR must be an absolute path
if(process.env.GLOBAL_DIR && (!isAbsolute(process.env.GLOBAL_DIR) || process.env.GLOBAL_DIR.endsWith('/') || process.env.GLOBAL_DIR.endsWith('\\'))){

    console.log(`\u001b[38;5;202m[${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]\u001b[38;5;99m(pid:${process.pid})\x1b[36;1m Path to GLOBAL_DIR must be absolute and without '/' or '\\' on the end\x1b[0m`)

    process.exit(1)

}




//____________________DEFINE PATHS_______________________

//All content bellow are stored like LOGS_PATH/</SYMBIOTE_ID>/...subdirs
[

    'CHAINDATA',//Data of symbiotes
    
    'GENESIS',//Directory which holds subdirs with files for GENESIS data for symbiotes

    'CONFIGS',//Directory with configs

    'LOGS',//Directory which holds subdirs with log streams.

    'SNAPSHOTS'//Directory with snapshots of state for symbiotes

].forEach(scope=>{

    if(process.env.KLY_MODE==='main'){
    
        //If GLOBAL_DIR is setted-it will be a location for all the subdirs above(CHAINDATA,GENESIS,etc.)
        if(process.env.GLOBAL_DIR) process.env[`${scope}_PATH`]=process.env.GLOBAL_DIR+`/${scope}`

        //If path was set directly(like CONFIGS_PATH=...)-then OK,no problems. DBs without direct paths will use default path
        else process.env[`${scope}_PATH`] ||= PATH_RESOLVE(scope)  

    }else{

        if(process.env.GLOBAL_DIR) process.env[`${scope}_PATH`]=process.env.GLOBAL_DIR+`/${scope}`

        process.env[`${scope}_PATH`] ||= PATH_RESOLVE(`ANTIVENOM/${scope}`)//Testnet available in ANTIVENOM separate directory

    }

})




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
fs.readdirSync(process.env.CONFIGS_PATH).forEach(file=>
    
    Object.assign(CONFIG,JSON.parse(fs.readFileSync(process.env.CONFIGS_PATH+`/${file}`)))
    
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
        if(!IN_PROCESS.GENERATE && !IN_PROCESS.VERIFY || Object.keys(SIG_PROCESS).every(symbiote => Object.values(SIG_PROCESS[symbiote]).every(x=>x))){

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



//Define general global object
global.SYMBIOTES_LOGS_STREAMS=new Map()

global.PRIVATE_KEYS=new Map()

global.SIG_SIGNAL=false

global.SIG_PROCESS={}



//Location for symbiotes
!fs.existsSync(process.env.CHAINDATA_PATH) && fs.mkdirSync(process.env.CHAINDATA_PATH);

//And for snapshots
!fs.existsSync(process.env.SNAPSHOTS_PATH) && fs.mkdirSync(process.env.SNAPSHOTS_PATH);

//For logs streams
!fs.existsSync(process.env.LOGS_PATH) && fs.mkdirSync(process.env.LOGS_PATH);




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

    if(process.env.KLY_MODE==='main'){

        //Read banner
        console.log('\x1b[36;1m'+fs.readFileSync(PATH_RESOLVE('images/banner.txt')).toString()
    
        //...and add extra colors & changes)
        .replace('Made on Earth for Universe','\x1b[31mMade on Earth for Universe\x1b[36m')
        .replace('REMEMBER:To infinity and beyond!','\x1b[31mREMEMBER:To infinity and beyond!\x1b[36m')
        .replace('@ Powered by Klyntar @','@ Powered by \u001b[7m\u001b[31;5;219mKlyntar\x1b[0m \x1b[36;1m@')
        .replaceAll('≈','\x1b[31m≈\x1b[36m')
        .replaceAll('#','\x1b[31m#\x1b[36m')+'\x1b[0m\n')
    
    }else{

        //else show the testnet banner

         //Read banner
        console.log('\u001b[37m'+fs.readFileSync(PATH_RESOLVE('images/testmode_banner.txt')).toString()
    
        //...and add extra colors & changes)
        .replace('Made on Earth for Universe','\u001b[38;5;87mMade on Earth for Universe\u001b[37m')
        .replace('REMEMBER:To infinity and beyond!','\u001b[38;5;87mREMEMBER:To infinity and beyond!\u001b[37m')
        .replace('@ Powered by Klyntar @','\u001b[38;5;87m@ Powered by \u001b[7m\u001b[38;5;202mKlyntar\x1b[0m \u001b[38;5;87m@')
    
        .replaceAll('≈','\x1b[31m≈\u001b[37m')
    
        .replaceAll('█','\u001b[38;5;202m█\u001b[37m')

        .replaceAll('═','\u001b[38;5;87m═\u001b[37m')
        .replaceAll('╝','\u001b[38;5;87m╝\u001b[37m')
        .replaceAll('╚','\u001b[38;5;87m╚\u001b[37m')
    
        .replaceAll('#','\u001b[38;5;202m#\u001b[37m')+'\x1b[0m\n')
    


    }

    
    LOG(`System info \x1b[31m${['node:'+process.version,`info:${process.platform+os.arch()} # ${os.version()} # threads_num:${process.env.UV_THREADPOOL_SIZE}/${os.cpus().length}`,`role:${CONFIG.ROLE}(runned as ${os.userInfo().username})`,`galaxy:${CONFIG.GALAXY}`].join('\x1b[36m / \x1b[31m')}`,'I')

    LOG(fs.readFileSync(PATH_RESOLVE('images/events/start.txt')).toString(),'S')
    
    


//_____________________________________________ADVANCED PREPARATIONS____________________________________________




    //If some chain marked as "STOP",we don't prepare something for it,otherwise-force preparation work
    let symbiChains=Object.keys(CONFIG.SYMBIOTES),
    
        rennaisances=new Map()



    
    //.forEach has inner scope,but we need await on top frame level
    for(let i=0;i<symbiChains.length;i++){

        if(!CONFIG.SYMBIOTES[symbiChains[i]].STOP_WORK){

            let {RENAISSANCE,PREPARE_SYMBIOTE} = await import(`./KLY_Workflows/${CONFIG.SYMBIOTES[symbiChains[i]].MANIFEST.WORKFLOW}/life.js`)

            await PREPARE_SYMBIOTE(symbiChains[i])

            rennaisances.set(symbiChains[i],RENAISSANCE)

        }

    }
    


    //Make this shit for memoization and not to repeate .stringify() within each request.Some kind of caching
    //BTW make it global to dynamically change it in the onther modules
    global.INFO=JSON.stringify(CONFIG.INFO)
    



//____________________________________________ASK FOR FINAL AGREEMENT____________________________________________




    console.log('\n\n\n')
    
    LOG(fs.readFileSync(PATH_RESOLVE('images/events/serverConfigs.txt')).toString().replaceAll('@','\x1b[31m@\x1b[32m').replaceAll('Check the configs carefully','\u001b[38;5;50mCheck the configs carefully\x1b[32m'),'S')

    LOG(`\u001b[38;5;202mTLS\u001b[38;5;168m is \u001b[38;5;50m${CONFIG.TLS.ENABLED?'enabled':'disabled'}`,'CON')

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
    rennaisances.forEach(
        
        (startSymbiote,symbioteID) => startSymbiote(symbioteID)
        
    )
 



//_______________________________________________GET SERVER ROUTES______________________________________________




global.UWS_SERVER=UWS[CONFIG.TLS.ENABLED?'SSLApp':'App'](CONFIG.TLS.CONFIGS).listen(CONFIG.INTERFACE,CONFIG.PORT,descriptor=>{

    if(descriptor){

        LOG(`Node started on ———> \x1b[36;1m[${CONFIG.INTERFACE}]:${CONFIG.PORT}`,'S')

        global.UWS_DESC=descriptor
        
    }
    else LOG('Oops,some problems with server module','F')

})



//Call general code to start import routes
import(`./KLY_Workflows/dev@controller/routes.js`)



})()