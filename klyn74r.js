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

import {LOG,PATH_RESOLVE} from './KLY_Utils/utils.js'

import chalkAnimation from 'chalk-animation'

import {isAbsolute} from 'path'

import readline from 'readline'

import fastify from 'fastify'

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

// All symbiotes are runned in a single instance as mainnets by default
process.env.KLY_MODE||='main'


if(process.env.KLY_MODE!=='main' && process.env.KLY_MODE!=='test'){

    console.log(`\u001b[38;5;202m[${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]\u001b[38;5;99m(pid:${process.pid})\x1b[36;1m Unrecognized mode \x1b[32;1m${process.env.KLY_MODE}\x1b[0m\x1b[36;1m(choose 'test' for AntiVenom testnet or 'main' for your symbiotes)\x1b[0m`)

    process.exit(101)

}

//SYMBIOTE_DIR must be an absolute path
if(process.env.SYMBIOTE_DIR && (!isAbsolute(process.env.SYMBIOTE_DIR) || process.env.SYMBIOTE_DIR.endsWith('/') || process.env.SYMBIOTE_DIR.endsWith('\\'))){

    console.log(`\u001b[38;5;202m[${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]\u001b[38;5;99m(pid:${process.pid})\x1b[36;1m Path to SYMBIOTE_DIR must be absolute and without '/' or '\\' on the end\x1b[0m`)

    process.exit(102)

}




//____________________DEFINE PATHS_______________________


[

    'CHAINDATA',//Data of symbiote
    
    'GENESIS',//Directory with files for GENESIS data for symbiotes

    'CONFIGS',//Directory with configs(for node,symbiote and so on)


].forEach(scope=>{

    if(process.env.KLY_MODE==='main'){
    
        //If SYMBIOTE_DIR is set - it will be a location for all the subdirs above(CHAINDATA,GENESIS,CONFIGS)
        if(process.env.SYMBIOTE_DIR) process.env[`${scope}_PATH`]=process.env.SYMBIOTE_DIR+`/${scope}`

        //If path was set directly(like CONFIGS_PATH=...)-then OK,no problems. DBs without direct paths will use default path
        else process.env[`${scope}_PATH`] ||= PATH_RESOLVE('MAINNET/'+scope)  

    }else{

        if(process.env.SYMBIOTE_DIR) process.env[`${scope}_PATH`]=process.env.SYMBIOTE_DIR+`/${scope}`

        process.env[`${scope}_PATH`] ||= PATH_RESOLVE(`ANTIVENOM/${scope}`)//Testnet available in ANTIVENOM separate directory

    }

})





/*

                                        

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



    
//_________________________________________________CONFIG_PROCESS_______________________________________________


//Define globally
global.CONFIG={}


//Load all the configs
fs.readdirSync(process.env.CONFIGS_PATH).forEach(file=>
    
    Object.assign(global.CONFIG,JSON.parse(fs.readFileSync(process.env.CONFIGS_PATH+`/${file}`)))
    
)


//Load genesis
global.GENESIS=JSON.parse(fs.readFileSync(process.env.GENESIS_PATH+`/genesis.json`))


//________________________________________________SHARED RESOURCES______________________________________________


//Location for symbiotes
!fs.existsSync(process.env.CHAINDATA_PATH) && fs.mkdirSync(process.env.CHAINDATA_PATH);


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




//_________________________________________________BANNERS INTRO________________________________________________




process.stdout.write('\x1Bc')
    
//Cool short animation
await new Promise(r=>{
    
    let animation=chalkAnimation.glitch('\x1b[31;1m'+fs.readFileSync(PATH_RESOLVE('images/intro.txt')).toString()+'\x1b[0m')

    setTimeout(()=>{ animation.stop() ; r() },global.CONFIG.PRELUDE.ANIMATION_DURATION)

})


process.stdout.write('\x1Bc')

if(process.env.KLY_MODE==='main'){

    //Read banner
    console.log('\x1b[36;1m'+fs.readFileSync(PATH_RESOLVE('images/banner.txt')).toString()

    //...and add extra colors & changes)
    .replace('Made on Earth for Universe','\x1b[31mMade on Earth for Universe\x1b[36m')
    .replace('REMEMBER:To infinity and beyond!','\x1b[31mREMEMBER:To infinity and beyond!\x1b[36m')
    .replaceAll('≈','\x1b[31m≈\x1b[36m')
    .replaceAll('#','\x1b[31m#\x1b[36m')+'\x1b[0m\n')

}else{

    //else show the testnet banner

     //Read banner
    console.log('\u001b[37m'+fs.readFileSync(PATH_RESOLVE('images/testmode_banner.txt')).toString()

    //...and add extra colors & changes)
    .replace('Made on Earth for Universe','\u001b[38;5;87mMade on Earth for Universe\u001b[37m')
    .replace('REMEMBER:To infinity and beyond!','\u001b[38;5;87mREMEMBER:To infinity and beyond!\u001b[37m')
     
    .replaceAll('≈','\x1b[31m≈\u001b[37m')

    .replaceAll('█','\u001b[38;5;202m█\u001b[37m')

    .replaceAll('═','\u001b[38;5;87m═\u001b[37m')
    .replaceAll('╝','\u001b[38;5;87m╝\u001b[37m')
    .replaceAll('╚','\u001b[38;5;87m╚\u001b[37m')

    .replaceAll('#','\u001b[38;5;202m#\u001b[37m')+'\x1b[0m\n')



}


LOG(`System info \x1b[31m${['node:'+process.version,`info:${process.platform+os.arch()} # ${os.version()} # threads_num:${process.env.UV_THREADPOOL_SIZE}/${os.cpus().length}`,`role:${global.CONFIG.ROLE}(runned as ${os.userInfo().username})`,`galaxy:${global.CONFIG.GALAXY}`].join('\x1b[36m / \x1b[31m')}`,'I')




//_____________________________________________ADVANCED PREPARATIONS____________________________________________



//Make this shit for memoization and not to repeate .stringify() within each request.Some kind of caching
//BTW make it global to dynamically change it in the onther modules
global.MY_KLY_INFRASTRUCTURE = JSON.stringify(global.CONFIG.SYMBIOTE.MY_KLY_INFRASTRUCTURE)



//____________________________________________ASK FOR FINAL AGREEMENT____________________________________________




console.log('\n\n\n')

LOG(fs.readFileSync(PATH_RESOLVE('images/events/serverConfigs.txt')).toString().replaceAll('@','\x1b[31m@\x1b[32m').replaceAll('Check the configs carefully','\u001b[38;5;50mCheck the configs carefully\x1b[32m'),'S')

LOG(`\u001b[38;5;202mTLS\u001b[38;5;168m is \u001b[38;5;50m${global.CONFIG.TLS.ENABLED?'enabled':'disabled'}`,'CON')

LOG(`Server is working on \u001b[38;5;50m[${global.CONFIG.INTERFACE}]:${global.CONFIG.PORT}`,'CON')

LOG(global.CONFIG.PLUGINS.length!==0 ? `Runned plugins(${global.CONFIG.PLUGINS.length}) are \u001b[38;5;50m${global.CONFIG.PLUGINS.join(' \u001b[38;5;202m<>\u001b[38;5;50m ')}`:'No plugins will be runned. Find the best plugins for you here \u001b[38;5;50mhttps://github.com/KLYN74R/Plugins','CON')


!global.CONFIG.PRELUDE.OPTIMISTIC
&&
await new Promise(resolve=>
    
    readline.createInterface({input:process.stdin, output:process.stdout, terminal:false})

    .question(`\n ${`\u001b[38;5;${process.env.KLY_MODE==='main'?'23':'202'}m`}[${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]${'\x1b[36;1m'}  Do you agree with the current configuration? Enter \x1b[32;1mYES\x1b[36;1m to continue ———> \x1b[0m`,resolve)
    
).then(answer=>answer!=='YES'&& process.exit(103))


LOG(fs.readFileSync(PATH_RESOLVE('images/events/start.txt')).toString(),'S')



let {RUN_SYMBIOTE} = await import(`./KLY_Workflows/${global.GENESIS.WORKFLOW}/life.js`)

await RUN_SYMBIOTE()
    


for(let scriptPath of global.CONFIG.PLUGINS){

    import(`./KLY_Plugins/${scriptPath}`).catch(
        
        e => LOG(`Some error has been occured in process of plugin \u001b[38;5;50m${scriptPath}\x1b[31;1m load\n${e}\n`,'F')
        
    )

}




//_______________________________________________GET SERVER ROUTES______________________________________________



export const FASTIFY_SERVER = fastify(global.CONFIG.FASTIFY_OPTIONS)


// Import routes

import(`./KLY_Workflows/${global.GENESIS.WORKFLOW}/routes.js`)



FASTIFY_SERVER.listen({port:global.CONFIG.PORT,host:global.CONFIG.INTERFACE},(err,_address)=>{

    if(!err) LOG(`Node started on \x1b[36;1m[${global.CONFIG.INTERFACE}]:${global.CONFIG.PORT}`,'S')

    else LOG('Oops,some problems with server module','F')

})