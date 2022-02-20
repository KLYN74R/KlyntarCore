import {LOG,SIG,BLOCKLOG,BROADCAST,SYMBIOTE_ALIAS} from '../KLY_Utils/utils.js'

import ControllerBlock from '../KLY_Blocks/controllerblock.js'

import InstantBlock from '../KLY_Blocks/instantblock.js'

import {START_VERIFY_POLLING} from './verification.js'

import {symbiotes,hostchains} from '../klyn74r.js'

import fetch from 'node-fetch'




//________________________________________________________________INTERNAL_______________________________________________________________________




let BLOCK_PATTERN=process.platform==='linux'?'——':'———',



//TODO:Add more advanced logic(e.g number of txs,ratings,etc.)
GET_TXS = symbiote => symbiotes.get(symbiote).MEMPOOL.splice(0,CONFIG.SYMBIOTES[symbiote].MANIFEST.EVENTS_LIMIT_PER_BLOCK),




//TODO:Add more advanced logic(e.g number of txs,ratings,etc.)
GET_CANDIDATES=async symbiote=>{
    
    let limit=0,
    
        promises=[],
        
        state=symbiotes.get(symbiote).STATE



    for (let [hash,creator] of symbiotes.get(symbiote).INSTANT_CANDIDATES.entries()){
        
        symbiotes.get(symbiote).INSTANT_CANDIDATES.delete(hash)
        
        //Get account of InstantBlock creator and check if he still has STAKE
        promises.push(state.get(creator).then(acc=>
            
            //If enough on balance-then pass hash.Otherwise-delete block from candidates and return "undefined" 
            acc.B>=CONFIG.SYMBIOTES[symbiote].MANIFEST.INSTANT_FREEZE
            ?
            hash
            :
            symbiotes.get(symbiote).CANDIDATES.del(hash).catch(e=>
                
                LOG(`Can't delete candidate \x1b[36;1m${hash}\x1b[33;1m on \x1b[36;1m${SYMBIOTE_ALIAS(symbiote)}`,'W')
                
            )

        
        ).catch(e=>false))
        
        //Limitation
        if(limit++==CONFIG.SYMBIOTES[symbiote].MANIFEST.INSTANT_PORTION) break
    
    }
    
    //No "return await"

    let readySet=await Promise.all(promises).then(arr=>arr.filter(Boolean)).catch(e=>
    
        LOG(`Oops,set of instant blocks is empty on chain \x1b[36;1m${SYMBIOTE_ALIAS(symbiote)}\n${e}`,'W'),
        
        []

    )

    return readySet


},




GEN_BLOCK_START=async(symbiote,type)=>{

    if(!SIG_SIGNAL){
    
        await GEN_BLOCK(symbiote,type)

        STOP_GEN_BLOCK[symbiote][type]=setTimeout(()=>GEN_BLOCK_START(symbiote,type),CONFIG.SYMBIOTES[symbiote][type+'_BLOCK_GENERATION_TIME'])
    
        CONFIG.SYMBIOTES[symbiote]['STOP_GENERATE_BLOCK_'+type]
        &&
        clearTimeout(STOP_GEN_BLOCK[symbiote][type])
      
    }else{

        LOG(`Block generation for \x1b[36;1m${SYMBIOTE_ALIAS(symbiote)}\x1b[36;1m was stopped`,'I',symbiote)

        SIG_PROCESS[symbiote].GENERATE=true

    }
    
},




RUN_POLLING=async symbiote=>{

    LOG(`Local state collapsed on \x1b[36;1m${symbiotes.get(symbiote).VERIFICATION_THREAD.COLLAPSED_INDEX}\x1b[32;1m for \x1b[36;1m${SYMBIOTE_ALIAS(symbiote)}`,'S')

 
    START_VERIFY_POLLING(symbiote)

}




//________________________________________________________________EXTERNAL_______________________________________________________________________




export let GEN_BLOCK=async(symbiote,data)=>{

    let block,hash,route,
    
    symbioteRef=symbiotes.get(symbiote)

    
    
    //!Here check the difference between VT and GT(VT_GT_NORMAL_DIFFERENCE)
    if(symbioteRef.VERIFICATION_THREAD.COLLAPSED_INDEX+CONFIG.SYMBIOTES[symbiote].VT_GT_NORMAL_DIFFERENCE < symbioteRef.GENERATION_THREAD.NEXT_INDEX){

        LOG(`Block generation for \u001b[38;5;m${SYMBIOTE_ALIAS(symbiote)}\x1b[36;1m skipped because GT is faster than VT. Increase \u001b[38;5;157m<VT_GT_NORMAL_DIFFERENCE>\x1b[36;1m if you need`,'I',symbiote)

        return

    }



    if(data==='C'){




        //_________________________________________GENERATE PORTION OF BLOCKS___________________________________________
        
        
        //To fill ControllerBlocks for maximum
        
        let phantomControllers=Math.ceil(symbiotes.get(symbiote).INSTANT_CANDIDATES.size/CONFIG.SYMBIOTES[symbiote].MANIFEST.INSTANT_PORTION),

            genThread=symbiotes.get(symbiote).GENERATION_THREAD,
    
            promises=[]//to push blocks to storage


        
        //If nothing to generate-then no sense to generate block,so return
        if(phantomControllers===0) return 



        for(let i=0;i<phantomControllers;i++){

            let arr=await GET_CANDIDATES(symbiote),
            
                block=new ControllerBlock(symbiote,arr)
            

            hash=ControllerBlock.genHash(symbiote,block.a,block.i,genThread.PREV_HASH)
    
            block.sig=await SIG(hash,PRIVATE_KEYS.get(symbiote))

            route='/cb'
            
            BLOCKLOG(`New \x1b[36m\x1b[41;1mControllerBlock\x1b[0m\x1b[32m generated ${BLOCK_PATTERN}│\x1b[36;1m`,'S',symbiote,hash,59,'\x1b[32m')

            
            genThread.PREV_HASH=hash
 
            genThread.NEXT_INDEX++
 


            promises.push(symbiotes.get(symbiote).CONTROLLER_BLOCKS.put(block.i,block).then(()=>block).catch(e=>{
                
                LOG(`Failed to store block ${block.i} on ${SYMBIOTE_ALIAS(symbiote)}`,'F')

                process.emit('SIGINT',122)
            
            }))
           
        }


        

        //_______________________________________________COMMIT CHANGES___________________________________________________


        //Commit group of blocks by setting hash and index of the last one

        await Promise.all(promises).then(arr=>
            
            
            symbiotes.get(symbiote).METADATA.put('GT',genThread).then(()=>

                new Promise(resolve=>{

                    //And here we should broadcast blocks
                    arr.forEach(block=>
                    
                        Promise.all(BROADCAST(route,block,symbiote))
                    
                    )


                    //_____________________________________________PUSH TO HOSTCHAINS_______________________________________________
    
                    //Push to hostchains due to appropriate symbiote
                    Object.keys(CONFIG.SYMBIOTES[symbiote].MANIFEST.HOSTCHAINS).forEach(async ticker=>{
    
                        //TODO:Add more advanced logic
                        if(!CONFIG.SYMBIOTES[symbiote].STOP_PUSH_TO_HOSTCHAINS[ticker]){
    
                            let control=symbiotes.get(symbiote).HOSTCHAINS_WORKFLOW[ticker],
                        
                                hostchain=hostchains.get(symbiote).get(ticker),
    
                                //If previous push is still not accepted-then no sense to push new symbiote update
                                isAlreadyAccepted=await hostchain.checkTx(control.HOSTCHAIN_HASH,control.INDEX,control.KLYNTAR_HASH,symbiote).catch(e=>false)
                        
                            


                            LOG(`Check if previous commit is accepted for \x1b[32;1m${SYMBIOTE_ALIAS(symbiote)}\x1b[36;1m on \x1b[32;1m${ticker}\x1b[36;1m ~~~> \x1b[32;1m${
                                
                                control.KLYNTAR_HASH===''?'Just start':isAlreadyAccepted
                            
                            }`,'I')
    
                            


                            if(control.KLYNTAR_HASH===''||isAlreadyAccepted){
    
                                //If accpted-we can share to the rest
                                isAlreadyAccepted
                                &&
                                Promise.all(BROADCAST('/proof',{...control,symbiote,ticker},symbiote))
                            
    
                                let index=symbiotes.get(symbiote).GENERATION_THREAD.NEXT_INDEX-1,
    
                                    symbioticHash=await hostchain.sendTx(symbiote,index,genThread.PREV_HASH).catch(e=>{
                                        
                                        LOG(`Error on \x1b[36;1m${SYMBIOTE_ALIAS(symbiote)}\u001b[38;5;3m with push to \x1b[36;1m${ticker} \n${e}`,'W')
                                    
                                        return false

                                    })
                        
    
                                if(symbioticHash){
    
                                    LOG(`Commit on ${SYMBIOTE_ALIAS(symbiote)}\x1b[32;1m to \x1b[36;1m${ticker}\x1b[32;1m for block \x1b[36;1m${index}\x1b[32;1m is \x1b[36;1m${symbioticHash}`,'S')
    
                                    //Commit localy that we have send it
                                    control.KLYNTAR_HASH=genThread.PREV_HASH
                            
                                    control.INDEX=index
                            
                                    control.HOSTCHAIN_HASH=symbioticHash
    
                                    control.SIG=await SIG(control.KLYNTAR_HASH+control.INDEX+control.HOSTCHAIN_HASH+ticker,PRIVATE_KEYS.get(symbiote))



                                    
                                    await symbiotes.get(symbiote).HOSTCHAINS_DATA.put(index+ticker,{KLYNTAR_HASH:control.KLYNTAR_HASH,HOSTCHAIN_HASH:control.HOSTCHAIN_HASH,SIG:control.SIG})

                                                .then(()=>symbiotes.get(symbiote).HOSTCHAINS_DATA.put(ticker,control))//set such canary to avoid duplicates when quick reboot daemon
                            
                                                .then(()=>LOG(`Locally store pointer for \x1b[36;1m${index}\x1b[32;1m block of \x1b[36;1m${SYMBIOTE_ALIAS(symbiote)}\x1b[32;1m on \x1b[36;1m${ticker}`,'S'))
                            
                                                .catch(e=>LOG(`Error-impossible to store pointer for \x1b[36;1m${index}\u001b[38;5;3m block of \x1b[36;1m${SYMBIOTE_ALIAS(symbiote)}\u001b[38;5;3m on \x1b[36;1m${ticker}`,'W'))
    
    
                                }

                                LOG(`Balance of controller on hostchain \x1b[32;1m${ticker}\x1b[36;1m is \x1b[32;1m${await hostchain.getBalance(symbiote)}`,'I')
                        
                            }
    
                        }
                        
                    })


                    resolve()


                })


            ).catch(e=>{

                LOG(e,'F')
                    
                process.emit('SIGINT',114)

            })
        
        )

    }
    else{

        
        //______________________________TEST__________________________________
        
        let block=new InstantBlock(symbiote,await GET_TXS(symbiote))

        //if (block.e.length===0) return//no sense to produce empty blocks

        //_____________________________DELELTE________________________________

        //TEST DATA TO FILL THE BLOCK

        // try{
        // if(chain=='RqtrnrLAdxpUkjqKS42RKbgN1ryXad3NeJrPTBZpdyVL'){

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

        
        hash=InstantBlock.genHash(block.c,block.e,symbiote)

        block.sig=await SIG(hash,PRIVATE_KEYS.get(symbiote))
            
        route='/ib'

        //____________________________________TEST_____________________________


        BLOCKLOG(`New \x1b[36;1m\x1b[44;1mInstantBlock\x1b[0m\x1b[32m generated ${BLOCK_PATTERN}│`,'S',symbiote,hash,56,'\x1b[32m')

        await symbiotes.get(symbiote).CANDIDATES.put(hash,block)

        Promise.all(BROADCAST(route,block,symbiote))

        //These blocks also will be included
        symbiotes.get(symbiote).INSTANT_CANDIDATES.set(hash,CONFIG.SYMBIOTES[symbiote].PUB)
        
    }

},




RENAISSANCE=async()=>{


    
//_____________________________________________________Connect with CONTROLLER & NODES___________________________________________________________




    let promises=[]

    
    Object.keys(CONFIG.SYMBIOTES).forEach(symbioteID=>

        !CONFIG.SYMBIOTES[symbioteID].STOP_WORK
        &&
        promises.push(

            //Controller doesn't need to load state coz without him there are no progress in chain.At least-in the first versions
            RUN_POLLING(symbioteID).then(()=>
            
            /*
            
            Get current nodeset due to region.NOTE-each controller may has different depth of nodeset
            
            Someone can give u list of nodes from region(e.g EU(Europe),NA(Nothern America),etc.)
            Some controllers will have better localization(e.g EU_FR(Europe,France),NA_US_CA(United States,California))
            
            Every controller may use own labels,follow ISO-3166 formats or even digits(e.g 0-Europe,1-USA,01-Europe,Germany,etc.)

            Format defined by Controller and become public for Instant generators and other members to let them to find the best&fastest options

            */
            !CONFIG.SYMBIOTES[symbioteID].CONTROLLER.ME
            &&
            fetch(CONFIG.SYMBIOTES[symbioteID].CONTROLLER.ADDR+'/nodes/'+symbioteID+'/'+CONFIG.SYMBIOTES[symbioteID].REGION).then(r=>r.json()).then(
                
                async nodesArr=>{
                    
                    LOG(`Received ${nodesArr.length} addresses from ${SYMBIOTE_ALIAS(symbioteID)}...`,'I')

                    let answers=[]
                
                    //Ask if these nodes are available and ready to share data with us
                    nodesArr.forEach(
                        
                        addr => answers.push(
                            
                            fetch(addr+'/addnode',{method:'POST',body:JSON.stringify([symbioteID,CONFIG.SYMBIOTES[symbioteID].MY_ADDR])})
                        
                                    .then(res=>res.text())
                        
                                    .then(val=>val==='OK'&&symbiotes.get(symbioteID).NEAR.push(addr))
                        
                                    .catch(e=>'')
                                    
                        )
                        
                    )

                    await Promise.all(answers)
                
                    LOG(`Total nodeset ${SYMBIOTE_ALIAS(symbioteID)}...\x1b[36;1m  has ${symbiotes.get(symbioteID).NEAR.length} addresses`,'I')
                
                }
            
            ).catch(e=>LOG(`Controller of \x1b[36;1m${SYMBIOTE_ALIAS(symbioteID)}\x1b[31;1m is offline or some error has been occured\n${e}\n`,'F'))
        
        ))
        
    )


    await Promise.all(promises.splice(0))




//______________________________________________________RUN BLOCKS GENERATION PROCESS____________________________________________________________


    //Create each time when we run some block generation thread and there were no processes before
    //Don't paste it inside GEN_BLOCK_START not to repeat checks every call
    global.STOP_GEN_BLOCK={}


    //Creates two timers to generate both blocks separately and to control this flows with independent params
    Object.keys(CONFIG.SYMBIOTES).forEach(controllerAddr=>{
        
        let symbioteRef=CONFIG.SYMBIOTES[controllerAddr]

        if(!symbioteRef.STOP_WORK){
        
            //Start generate ControllerBlocks if you're controller(obviously)
            !symbioteRef.STOP_C && symbioteRef.CONTROLLER.ME && setTimeout(()=>{
                
                STOP_GEN_BLOCK[controllerAddr]={C:''}
                
                GEN_BLOCK_START(controllerAddr,'C')
            
            },symbioteRef.BLOCK_С_INIT_DELAY)



            
            !symbioteRef.STOP_I && setTimeout(()=>{

                STOP_GEN_BLOCK[controllerAddr] ? STOP_GEN_BLOCK[controllerAddr]['I']='' : STOP_GEN_BLOCK[controllerAddr]={C:'',I:''}

                GEN_BLOCK_START(controllerAddr,'I')

            },symbioteRef.BLOCK_I_INIT_DELAY)

        }

    })
    
}