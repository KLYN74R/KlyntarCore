import {LOG,SIG,BLOCKLOG,BROADCAST,VERIFY,CHAIN_LABEL,BLAKE3,PATH_RESOLVE} from '../KLY_Space/utils.js'

import {GET_CONTROLLER_BLOCK,START_VERIFY_POLLING} from './verification.js'

import ControllerBlock from '../KLY_Blocks/controllerblock.js'

import InstantBlock from '../KLY_Blocks/instantblock.js'

import {chains,metadata,hostchains} from '../klyn74r.js'

import fetch from 'node-fetch'

import fs from 'fs'




//________________________________________________________________INTERNAL_______________________________________________________________________




let BLOCK_PATTERN=process.platform==='linux'?'——':'———',



//TODO:Add more advanced logic(e.g number of txs,ratings,etc.)
GET_TXS=chain=>

    ['D','S'].map(type=>
        
        chains.get(chain)[`MEMPOOL_${type}TXS`].splice(0,CONFIG.CHAINS[chain].MANIFEST[`INSTANT_BLOCK_${type}TXS_MAX`])
        
    ),




//TODO:Add more advanced logic(e.g number of txs,ratings,etc.)
GET_CANDIDATES=async chain=>{
    
    let limit=0,
    
        promises=[],
        
        state=chains.get(chain).STATE



    for (let [hash,creator] of chains.get(chain).INSTANT_CANDIDATES.entries()){
        
        chains.get(chain).INSTANT_CANDIDATES.delete(hash)
        
        //Get account of InstantBlock creator and check if he still has STAKE
        promises.push(state.get(creator).then(acc=>
            
            //If enough on balance-then pass hash.Otherwise-delete block from candidates and return "undefined" 
            acc.B>=CONFIG.CHAINS[chain].MANIFEST.INSTANT_FREEZE
            ?
            hash
            :
            chains.get(chain).CANDIDATES.del(hash).catch(e=>
                
                LOG(`Can't delete candidate \x1b[36;1m${hash}\x1b[33;1m on \x1b[36;1m${CHAIN_LABEL(chain)}`,'W')
                
            )

        
        ).catch(e=>false))
        
        //Limitation
        if(limit++==CONFIG.CHAINS[chain].INSTANT_PORTION) break
    
    }
    
    //No "return await"

    let readySet=await Promise.all(promises).then(arr=>arr.filter(Boolean)).catch(e=>
    
        LOG(`Oops,set of instant blocks is empty on chain \x1b[36;1m${CHAIN_LABEL(chain)}\n${e}`,'W'),
        
        []

    )

    return readySet


},




GEN_BLOCK_START=async(chain,type)=>{

    if(!SIG_SIGNAL){
    
        await GEN_BLOCK(chain,type)

        STOP_GEN_BLOCK[chain][type]=setTimeout(()=>GEN_BLOCK_START(chain,type),CONFIG.CHAINS[chain][type+'TIMEOUT'])
    
        CONFIG.CHAINS[chain]['STOP_'+type]&&clearTimeout(STOP_GEN_BLOCK[chain][type])
      
    }else{

        LOG(`Block generation for \x1b[36;1m${CHAIN_LABEL(chain)}\x1b[36;1m was stopped`,'I')

        SIG_PROCESS[chain].GENERATE=true

    }
    
},




//!Make range queries
LOAD_ABSENT=async(chain,from,to)=>{

 
    //LOAD_ABSENT(chain,absentFrom,absentTo)

    let controllerDb=chains.get(chain).CONTROLLER_BLOCKS,
    
        instantDb=chains.get(chain).INSTANT_BLOCKS

    
    from=Math.min(await controllerDb.get('LOADED').catch(e=>from),from)//if you close previous session on block loading process,you'll load needed blocks anyway



    for(;from<to;from++){
        
        let block=await GET_CONTROLLER_BLOCK(chain,from)

        if(await VERIFY(ControllerBlock.genHash(chain,block.a,from,block.p),block.sig,chain)){

            controllerDb.put(from,block).catch(e=>
                
                LOG(`Can't get InstantBlock \x1b[36;1m${instantHash}\u001b[38;5;3m for \x1b[36;1m${CHAIN_LABEL(chain)}`,'W')
                
            )

            

            if(CONFIG.CHAINS[chain].REQUEST_ABSENT_BLOCKS.INSTANT){

                block.a.forEach(instantHash=>
                    
                    fetch(CONFIG.CHAINS[chain].GET_INSTANT+`/block/${Buffer.from(chain,'base64').toString('hex')}/i/`+instantHash)
                    
                    .then(r=>r.json()).then(block=>
                        

                        InstantBlock.genHash(chain,block.d,block.s,block.c)===instantHash
                        &&
                        instantDb.put(instantHash,block).catch(e=>LOG(`Can't set InstantBlock \x1b[36;1m${instantHash}\u001b[38;5;3m for \x1b[36;1m${CHAIN_LABEL(chain)}`,'W'))
    

                    ).catch(e=>LOG(`Can't get InstantBlock \x1b[36;1m${instantHash}\u001b[38;5;3m for \x1b[36;1m${CHAIN_LABEL(chain)}`,'W'))
                
                )
    
            }


            await controllerDb.put('LOADED',from).catch(e=>'')//fix loaded height


        }else LOG(`Signature verification of ControllerBlock \x1b[36;1m${from}\u001b[38;5;3m for \x1b[36;1m${CHAIN_LABEL(chain)}\u001b[38;5;3m failed`,'W')
    
    }

},




LOAD_STATE=async chain=>{
    
    if(!CONFIG.CHAINS[chain].CONTROLLER.ME){



        //___________________________________________LOAD STATE PREPARATION_____________________________________________


        let {host,pub}=CONFIG.CHAINS[chain].RENAISSANCE,
        
            chainState=chains.get(chain).STATE,
            
            absentFrom=QUANT_CONTROL[chain].COLLAPSED_INDEX


        await fetch(host+`/collapsed/${Buffer.from(chain,'base64').toString('hex')}`).then(async res=>{
        
            /*
            
            Receive ID of last collapsed block,statemap(['0','1','2'...])where element is STATE_IDs and stop bit-if we should ask for state later
            Note-for first releases we'll receive single blockID with statemap(which is [0]),
            but it might be mapping (stateId=>collapsed_block_id) due to cloud opportunities and scaling
            
            */
            
            let chainData=await res.json(),
        
                collapsedBlockId=chainData.id,

                collapsedHash=chainData.hash

                //statemap=new Map()//for future relesases and bigger state


            //__________________________________________CHECK IF WE NEED TO LOAD____________________________________________

            /*
            
            If your local height on this shard plus some allowed blocks above(defined via DANGER_DIFFERENCE in symbiote configuration)
            isn't more than real height on this shard-then it's better to load full state for this shard up to height close to real.
            

            In simply words-if you was offline too long or if it's first execution-you'll load full state instead of verifying all blocks
            Then if you need-you can laod absent blocks by special config option

            This way your node will start immediately and asynchronously will load absent blocks(if you set appropriate value in configs)
            
            */
           
            if(chainData.id-CONFIG.CHAINS[chain].DANGER_DIFFERENCE>QUANT_CONTROL[chain].COLLAPSED_INDEX||QUANT_CONTROL[chain].COLLAPSED_INDEX<0){

            
                if(chainData.stop){

                    LOG(`Rerun your node later(~15-20 seconds) to load state for \x1b[36;1m${CHAIN_LABEL(chain)}`,'W')
                
                    return

                    //Or better process.exit(code)
            
                }


                LOG(`Difference for ${CHAIN_LABEL(chain)}\x1b[36;1m forces us to load state.Keep waiting`,'I')

                let getStatePromises=[]

                //Start stream for each part of state
                chainData.statemap.forEach(stateID=>

                    //statemap.set(stateID,chainData.id),
                    
                    getStatePromises.push( fetch(host+`/state/${Buffer.from(chain,'base64').toString('hex')}/${stateID}`).then(res=>
        
                        new Promise((resolve,reject)=>{
                
                            let dest = fs.createWriteStream(PATH_RESOLVE(`TEMP/${Buffer.from(chain,'base64').toString('hex')+stateID}.json`)),

                                start=new Date().getTime()
                        
                                
                            res.body.pipe(dest)
                        
                            res.body.on('end',()=>resolve(start))
                        
                            dest.on('error',reject)
                    
                        })
                    
                    ).then(async start=>{
                    
                        LOG(`Collapse for \x1b[36;1m${CHAIN_LABEL(chain)} \x1b[36;1m-> ${stateID} \x1b[32;1m finished in \x1b[36;1m${(new Date().getTime()-start)/1000}\x1b[32;1m seconds`,'S')

                        let confirm=await fetch(host+`/collapsed/${Buffer.from(chain,'base64').toString('hex')}`).then(res=>
                        
                            res.json()
                        
                        ).then(chainData=> !chainData.stop&&chainData.id===collapsedBlockId ).catch(e=>false)




                        //This is the proof of valid state for current blockheight
                        if(confirm){
                
                            
                            let accountsPromises=[],
                            
                                {quark:accounts,sig}=JSON.parse(fs.readFileSync(PATH_RESOLVE(`TEMP/${Buffer.from(chain,'base64').toString('hex')+stateID}.json`)))

                            if(accounts&&await VERIFY(BLAKE3(JSON.stringify(accounts)),sig,pub)){

                            
                                //Simple realization of durability from ACID principles.Not to substitute our local value
                                accounts.QUANT=QUANT_CONTROL[chain]

                                Object.keys(accounts).forEach(address=>

                                    accountsPromises.push(chainState.put(address,accounts[address]).catch(e=>{

                                        LOG(`Can't write to db \x1b[36;1m${address} -> ${CHAIN_LABEL(chain)} -> ${stateID}`,'F')

                                        process.exit(110)//maybe omit

                                    }))

                                )

                            
                                await Promise.all(accountsPromises.splice(0))

                                try{
                            
                                    QUANT_CONTROL[chain].COLLAPSED_INDEX=collapsedBlockId
    
                                    QUANT_CONTROL[chain].COLLAPSED_HASH=collapsedHash
        
                                    await chainState.put('QUANT',QUANT_CONTROL[chain])

                                    fs.rmSync(PATH_RESOLVE(`TEMP/${Buffer.from(chain,'base64').toString('hex')+stateID}.json`))//Make it optionally
                        
                                }catch(e){
                            
                                    LOG(`Try to commit quantcontrol of \x1b[36;1m${CHAIN_LABEL(chain)}\x1b[31;1m but failed\n${e}\n`,'F')
                        
                                    process.exit(107)//maybe omit
                        
                                }
                        
                            }else process.exit(113)
                        
                        }else process.exit(113)//maybe omit and repeat later for this stateID

                    }).catch(e=>

                        //Again-here we probably can skip this stateID and try to load state closer to real existing ControllerBlock for this part of state
                    
                        LOG(`Oops,some problem with \x1b[36;1m${CHAIN_LABEL(chain)}\x1b[31;1m.Try to rerun your node to load collapsed state closer to current height\n${e}\n`,'F')
                    
                        //process.exit(111)//maybe omit
                
                    ))

                )

                await Promise.all(getStatePromises.splice(0))
            
            }else LOG(`Difference for ${CHAIN_LABEL(chain)}\x1b[36;1m is normal`,'I')

        }).catch(e=>
        
            LOG(`Oops,some problem with \x1b[36;1m${CHAIN_LABEL(chain)}\x1b[31;1m.Try to rerun your node to load collapsed state closer to current height\n${e}\n`,'F')
        
            //process.exit(112)//maybe omit
    
        )




        if(CONFIG.CHAINS[chain].REQUEST_ABSENT_BLOCKS.CONTROLLER){

            let absentTo=QUANT_CONTROL[chain].COLLAPSED_INDEX

            LOAD_ABSENT(chain,absentFrom,absentTo)
    
        }

    }

    LOG(`Local state collapsed on \x1b[36;1m${QUANT_CONTROL[chain].COLLAPSED_INDEX}\x1b[32;1m for \x1b[36;1m${CHAIN_LABEL(chain)}`,'S')


    START_VERIFY_POLLING(chain)

}




//________________________________________________________________EXTERNAL_______________________________________________________________________




export let GEN_BLOCK=async(chain,data)=>{

    let block,hash,route

    if(data==='C'){




        //_________________________________________GENERATE PORTION OF BLOCKS___________________________________________
        
        
        //To fill ControllerBlocks for maximum
        
        let phantomControllers=Math.ceil(chains.get(chain).INSTANT_CANDIDATES.size/CONFIG.CHAINS[chain].INSTANT_PORTION),
    
            promises=[]//to push blocks to storage



        for(let i=0;i<phantomControllers;i++){

            let arr=await GET_CANDIDATES(chain),
            
                block=new ControllerBlock(chain,arr)
            

            hash=ControllerBlock.genHash(chain,block.a,block.i,QUANT_CONTROL[chain].GENERATED_PREV_HASH)
    
            block.sig=await SIG(hash,PRIVATE_KEYS.get(chain))

            route='/cb'
            
            BLOCKLOG(`New \x1b[36m\x1b[41;1mControllerBlock\x1b[0m\x1b[32m generated ${BLOCK_PATTERN}│\x1b[36;1m`,'S',chain,hash,59,'\x1b[32m')

            
            QUANT_CONTROL[chain].GENERATED_PREV_HASH=hash

            QUANT_CONTROL[chain].NEXT_INDEX++


            promises.push(chains.get(chain).CONTROLLER_BLOCKS.put(block.i,block).then(()=>block).catch(e=>{
                
                LOG(`Failed to store block ${block.i} on ${CHAIN_LABEL(chain)}`,'F')

                process.exit(122)
            
            }))
           
        }


        

        //_______________________________________________COMMIT CHANGES___________________________________________________


        //Commit group of blocks by setting hash and index of the last one

        await Promise.all(promises).then(arr=>
            
            //Set quark data
            chains.get(chain).STATE.put('QUANT',QUANT_CONTROL[chain]).then(()=>

                new Promise(resolve=>{

                    //And here we should broadcast blocks
                    arr.forEach(block=>
                    
                        Promise.all(BROADCAST(route,block,chain))
                    
                    )


                    //_____________________________________________PUSH TO HOSTCHAINS_______________________________________________
    
                    //Push to hostchains due to appropriate symbiote
                    Object.keys(CONFIG.CHAINS[chain].MANIFEST.HOSTCHAINS).forEach(async ticker=>{
    
                        //TODO:Add more advanced logic
                        if(!CONFIG.CHAINS[chain].STOP_PUSH_TO_HOSTCHAINS[ticker]){
    
                            let control=chains.get(chain).HOSTCHAINS_WORKFLOW[ticker],
                        
                                hostchain=hostchains.get(chain).get(ticker),
    
                                //If previous push is still not accepted-then no sense to push new symbiote update
                                isAlreadyAccepted=await hostchain.checkTx(control.HOSTCHAIN_HASH,control.INDEX,control.KLYNTAR_HASH,chain).catch(e=>false)
                        
                            


                            LOG(`Check if previous commit is accepted for \x1b[32;1m${CHAIN_LABEL(chain)}\x1b[36;1m on \x1b[32;1m${ticker}\x1b[36;1m ~~~> \x1b[32;1m${
                                
                                control.KLYNTAR_HASH===''?'Just start':isAlreadyAccepted
                            
                            }`,'I')
    
                            


                            if(control.KLYNTAR_HASH===''||isAlreadyAccepted){
    
                                //If accpted-we can share to the rest
                                isAlreadyAccepted
                                &&
                                Promise.all(BROADCAST('/proof',{...control,chain,ticker},chain))
                            
    
    
    
                                let index=QUANT_CONTROL[chain].NEXT_INDEX-1,
    
                                    symbioticHash=await hostchain.sendTx(chain,index,QUANT_CONTROL[chain].GENERATED_PREV_HASH).catch(e=>{
                                        
                                        LOG(`Error on \x1b[36;1m${CHAIN_LABEL(chain)}\u001b[38;5;3m with push to \x1b[36;1m${ticker} \n${e}`,'W')
                                    
                                        return false

                                    })
                        
    
                                if(symbioticHash){
    
                                    LOG(`Commit on ${CHAIN_LABEL(chain)}\x1b[32;1m to \x1b[36;1m${ticker}\x1b[32;1m for block \x1b[36;1m${index}\x1b[32;1m is \x1b[36;1m${symbioticHash}`,'S')
    
                                    //Commit localy that we have send it
                                    control.KLYNTAR_HASH=QUANT_CONTROL[chain].GENERATED_PREV_HASH
                            
                                    control.INDEX=index
                            
                                    control.HOSTCHAIN_HASH=symbioticHash
    
                                    control.SIG=await SIG(control.KLYNTAR_HASH+control.INDEX+control.HOSTCHAIN_HASH+ticker,PRIVATE_KEYS.get(chain))



                                    
                                    await chains.get(chain).HOSTCHAINS_DATA.put(index+ticker,{KLYNTAR_HASH:control.KLYNTAR_HASH,HOSTCHAIN_HASH:control.HOSTCHAIN_HASH,SIG:control.SIG})

                                                .then(()=>chains.get(chain).HOSTCHAINS_DATA.put(ticker,control))//set such canary to avoid duplicates when quick reboot daemon
                            
                                                .then(()=>LOG(`Locally store pointer for \x1b[36;1m${index}\x1b[32;1m block of \x1b[36;1m${CHAIN_LABEL(chain)}\x1b[32;1m on \x1b[36;1m${ticker}`,'S'))
                            
                                                .catch(e=>LOG(`Error-impossible to store pointer for \x1b[36;1m${index}\u001b[38;5;3m block of \x1b[36;1m${CHAIN_LABEL(chain)}\u001b[38;5;3m on \x1b[36;1m${ticker}`,'W'))
    
    
                            
                                    LOG(`Balance of controller on hostchain \x1b[32;1m${ticker}\x1b[36;1m is \x1b[32;1m${await hostchain.getBalance(chain)}`,'I')
    
                                }
                        
                            }
    
                        }
                        
                    })


                    resolve()


                })


            ).catch(e=>{

                LOG(e,'F')
                    
                process.exit(114)

            })
        
        )

    }
    else{

        let txs=await GET_TXS(chain)
        
        //______________________________TEST__________________________________
        
        block=new InstantBlock(chain,...txs)
        

        //_____________________________DELELTE________________________________

        //TEST DATA TO FILL THE BLOCK

        // try{
        // if(chain=='q0Bl2spIOIBhA5pviv6B69RdBcZls7iy+y4Wc3tgSVs='){

        //     let KEYPAIR={

        //         pub: 'EHYLgeLygJM21grIVDPhPgXZiTBF1xvl5p7lOapZ534=',
        //         prv: 'MC4CAQAwBQYDK2VwBCIEIKN4J4SGoeRJuZG3bisJbSQFmqSG7XC0HFqnbbqGLX3Q'
        
        //     },
        
        //     myAddress=KEYPAIR.pub,//Ed25519 public key in BASE64
        
        //     payload='FROM_HELL',//some transaction data.In this case-it's setting up delegate
        
        //     chainNonce=await fetch('http://localhost:7777/account/ab4065daca48388061039a6f8afe81ebd45d05c665b3b8b2fb2e16737b60495b/10760b81e2f2809336d60ac85433e13e05d9893045d71be5e69ee539aa59e77e')
        
        //     .then(r=>r.json()).then(data=>data.N+1).catch(e=>{
            
        //         console.log(`Can't get chain level data`)
        
        //     }),//nonce on appropriate chain

    
        //     TXS=[]

        //     for(let i=0;i<10000;i++){
            
        //         TXS.push(
            
        //             {c:myAddress,d:payload,n:chainNonce,s:await SIG(payload+chain+chainNonce,KEYPAIR.prv)}
            
        //         )

        //         chainNonce++

        //     }

        //     block.s.push(...TXS)


        //     //test with many addresses
        //     let different=[]
            
        //     for(let i=0;i<20000;i++){
                
        //         let add=Buffer.from('TEST'+i,'utf-8').toString('base64')

        //         different.push(chains.get(chain).STATE.get(add).then(acc=>
        //             ({c:add,h:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',n:acc.N+1})
        //         ))
                
        //     }

        //     await Promise.all(different).then(txs=>block.d.push(...txs))

        // }
        // }catch{

        // }

        //_______________________________________________DELELTE________________________________

        
        hash=InstantBlock.genHash(chain,block.d,block.s,block.c)

        block.sig=await SIG(hash,PRIVATE_KEYS.get(chain))
            
        route='/ib'

        //____________________________________TEST_____________________________


        BLOCKLOG(`New \x1b[36;1m\x1b[44;1mInstantBlock\x1b[0m\x1b[32m generated ${BLOCK_PATTERN}│`,'S',chain,hash,56,'\x1b[32m')

        await chains.get(chain).CANDIDATES.put(hash,block)

        Promise.all(BROADCAST(route,block,chain))

        //These blocks also will be included
        chains.get(chain).INSTANT_CANDIDATES.set(hash,CONFIG.CHAINS[chain].PUB)
        
    }

},




//!Внтури проверяем если FILLED буфферы не пустые и решаем-чистить или нет в зависимости от того как долго были оффлайн
RENAISSANCE=async()=>{


    
//_____________________________________________________Connect with CONTROLLER & NODES___________________________________________________________




    let promises=[]

    
    Object.keys(CONFIG.CHAINS).forEach(chainID=>

        !CONFIG.CHAINS[chainID].STOP_CHAIN
        &&
        promises.push(

            //Controller doesn't need to load state coz without him there are no progress in chain.At least-in the first versions
            LOAD_STATE(chainID).then(()=>
            
            /*
            
            Get current nodeset due to region.NOTE-each controller may has different depth of nodeset
            
            Someone can give u list of nodes from region(e.g EU(Europe),NA(Nothern America),etc.)
            Some controllers will have better localization(e.g EU_FR(Europe,France),NA_US_CA(United States,California))
            
            Every controller may use own labels,follow ISO-3166 formats or even digits(e.g 0-Europe,1-USA,01-Europe,Germany,etc.)

            Format defined by Controller and become public for Instant generators and other members to let them to find the best&fastest options

            */
            !CONFIG.CHAINS[chainID].CONTROLLER.ME
            &&
            fetch(CONFIG.CHAINS[chainID].CONTROLLER.ADDR+'/nodes/'+Buffer.from(chainID,'base64').toString('hex')+'/'+CONFIG.CHAINS[chainID].REGION).then(r=>r.json()).then(
                
                nodesArr=>{
                    
                    LOG(`Received ${nodesArr.length} addresses from ${CHAIN_LABEL(chainID)}...`,'I')

                    //Ask if these nodes are available and ready to share data with us
                    nodesArr.forEach(
                        
                        addr=>fetch(addr+'/addnode',{method:'POST',body:JSON.stringify([chainID,CONFIG.CHAINS[chainID].MY_ADDR])})
                        
                                .then(res=>res.text())
                        
                                .then(val=>val==='OK'&&chains.get(chainID).NEAR.push(addr))
                        
                                .catch(e=>'')
                        
                    )

                    LOG(`Total nodeset ${CHAIN_LABEL(chainID)}...\x1b[36;1m  has ${chains.get(chainID).NEAR.length} addresses`,'I')
                
                }
            
            ).catch(e=>LOG(`Controller of \x1b[36;1m${CHAIN_LABEL(chainID)}\x1b[31;1m is offline or some error has been occured\n${e}\n`,'F'))
        
        ))
        
    )


    await Promise.all(promises.splice(0))


//_____________________________________________________________SYNCHRONIZATION___________________________________________________________________





//_________________________________________________________________PERIOD________________________________________________________________________
    
    
    PERIOD_START()




    //Create each time when we run some block generation thread and there were no processes before
    //Don't paste it inside GEN_BLOCK_START not to repeat checks every call
    global.STOP_GEN_BLOCK={}

    //Creates two timers to generate both blocks separately and to control this flows with independent params
    Object.keys(CONFIG.CHAINS).forEach(controllerAddr=>{
        
        let chainRef=CONFIG.CHAINS[controllerAddr]

        if(!chainRef.STOP_CHAIN){
        
            //Start generate ControllerBlocks if you're controller(obviously)
            !chainRef.STOP_C&&chainRef.CONTROLLER.ME&&setTimeout(()=>{
                
                STOP_GEN_BLOCK[controllerAddr]={C:''}
                
                GEN_BLOCK_START(controllerAddr,'C')
            
            },chainRef.BLOCK_С_INIT_DELAY)



            
            !chainRef.STOP_I&&setTimeout(()=>{

                STOP_GEN_BLOCK[controllerAddr]?STOP_GEN_BLOCK[controllerAddr]['I']='':STOP_GEN_BLOCK[controllerAddr]={C:'',I:''}

                GEN_BLOCK_START(controllerAddr,'I')

            },chainRef.BLOCK_I_INIT_DELAY)

        }

    })
    
}