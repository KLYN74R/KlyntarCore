import{

    BASE64,VERIFY,ENCRYPT,BODY,SAFE_ADD,GET_CHAIN_ACC,

    PARSE_JSON,BLOCKLOG,ACC_CONTROL,BROADCAST,CHAIN_LABEL,LOG, PATH_RESOLVE, SEND_REPORT

} from '../KLY_Space/utils.js'

import {verifyInstantBlock} from '../KLY_Process/verification.js'

import ControllerBlock from '../KLY_Blocks/controllerblock.js'

import {chains,space,hostchains} from '../klyn74r.js'

import c from 'crypto'

import fs from 'fs'




//______________________________________________________________MAIN PART________________________________________________________________________

let BLOCK_PATTERN=process.platform==='linux'?'——':'———'




export let M={








//__________________________________________________________BASIC FUNCTIONAL_____________________________________________________________________




    controllerBlock:a=>{

        let total=0,buf=Buffer.alloc(0)

        a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async(chunk,last)=>{
    
            if(total+chunk.byteLength<=CONFIG.MAX_PAYLOAD_SIZE){
            
                buf=await SAFE_ADD(buf,chunk,a)//build full data from chunks

                total+=chunk.byteLength
            
                if(last){
                
                    let block=await PARSE_JSON(buf),hash=ControllerBlock.genHash(block.c,block.a,block.i,block.p)
                    
                    if(chains.has(block.c)&&typeof block.a==='object'&&typeof block.i==='number'&&typeof block.p==='string'&&typeof block.sig==='string'&&await VERIFY(hash,block.sig,block.c)){
                    
                        let controllerBlocks=chains.get(block.c).CONTROLLER_BLOCKS
                        
                        controllerBlocks.get(block.i).catch(e=>{

                            BLOCKLOG(`New \x1b[36m\x1b[41;1mControllerBlock\x1b[0m\x1b[32m accepted  \x1b[31m${BLOCK_PATTERN}│`,'S',block.c,hash,59,'\x1b[31m')
                            
                            //Store it locally-we'll work with this block later
                            controllerBlocks.put(block.i,block).then(()=>
                            
                                Promise.all(BROADCAST('/cb',block,block.c))
                                
                            ).catch(e=>{})
                        
                        })
                    
                       !a.aborted&&a.end('OK')
    
                    }else !a.aborted&&a.end('Overview failed')

                }
            
            }else !a.aborted&&a.end('Payload limit')
        
        })
    
    },
    



    instantBlock:a=>{

        let total=0,buf=Buffer.alloc(0)

        a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async(chunk,last)=>{
    
            if(total+chunk.byteLength<=CONFIG.MAX_PAYLOAD_SIZE){
            
                buf=await SAFE_ADD(buf,chunk,a)//build full data from chunks

                total+=chunk.byteLength
            
                if(last){
                            
                    !a.aborted&&a.end('OK')

                    verifyInstantBlock(await PARSE_JSON(buf))

                } 
            
            }
        
        })
    
    },
    
    
    

    //Duck typin' in b.d     --->     d-delegation     n-newstx     a-default tx     i-become controller
    //Format of body : MSG{d:['chain',TX_OBJ],f:'fullHash'}
    //There is no 'c'(creator) field-we get it from tx
    tx:a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async v=>{
    
        let b=await BODY(v,CONFIG.PAYLOAD_SIZE),
        
            chain=b.d?.[0],
            
            obj=b.d?.[1]
        
        
        //Reject all txs if route is off and other guards methods
        if(!(chains.has(chain)&&CONFIG.CHAINS[chain].TRIGGERS.TX) || typeof obj?.c!=='string' || typeof obj.n!=='number' || typeof b.f!=='string'){
            
            !a.aborted&&a.end('Overview failed')
            
            return
        }


        //Shortcuts aka pointers
        let chainMempool,type,signa

        //Set pointers due to type of tx('S' or 'D')
        obj.s ? (signa=obj.s,type='STXS') : (signa='',type='DTXS')
                
        chainMempool=chains.get(chain)['MEMPOOL_'+type]

        
        /*
        
            ...and do such "lightweight" verification here to prevent db bloating
            Anyway we can bump with some short-term desynchronization while perform operations over ControllerBlock
            Verify and normalize object

            Fetch values about fees and MC from some DEZ sources

        */

        //The second operand tells us:if buffer is full-it makes whole logical expression FALSE
        if(chainMempool.length<CONFIG.CHAINS[chain][type+'_MEMPOOL_SIZE']){

            let strData

            if(typeof obj.a==='number'&&typeof obj.r==='string'&&typeof obj.t==='string'&&obj.a>0) strData=obj.r+obj.t+obj.a,obj={c:obj.c,r:obj.r,a:obj.a,t:obj.t,n:obj.n}
            
            else if(typeof obj.h==='string'&&obj.h.length===64) strData=obj.h,  obj={c:obj.c,h:obj.h,n:obj.n}
            
            else if(typeof obj.d==='string') strData=obj.d,  obj={c:obj.c,d:obj.d,n:obj.n}
            
            else if(typeof obj.m==='string') strData=obj.m,  obj={c:obj.c,m:obj.m,n:obj.n}
            

            if(signa!=='') obj.s=signa

            if(strData&&await ACC_CONTROL(obj.c,strData+chain+obj.n,b.f,1)){
    
                !a.aborted&&a.end('OK')

                chainMempool.push(obj)
                            
            }else !a.aborted&&a.end('Post overview failed')


        }
        else !a.aborted&&a.end('Mempool is fullfilled')
    
    }),








//________________________________________________________________SPACE__________________________________________________________________________








    //[0,1,2] -> 0-RSA pubkey 1-signature 2-chain(controllerAddr)
    startSpaceId:a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async v=>{
        
        let b=await BODY(v,CONFIG.EXTENDED_PAYLOAD_SIZE),

        //_________________________________Let's check permission for initial SpaceID generation_________________________________

        allow=
        
        //Check lightweight instant predicates
        typeof b.c==='string'&&typeof b.d?.[0]==='string'&&typeof b.d[1]==='string'&&typeof b.d[2]==='string'&&CONFIG.TRIGGERS.START_SPACE_ID
        
        &&//Also lightweight but account can be read from db,not from cache,so it might be promise.Check if address is on some chain(or entry is free) and address still don't have SID...etc
        
        (CONFIG.START_SID_EVERYONE || await GET_CHAIN_ACC(b.c,b.d[2])) && !(ACCOUNTS.cache.has(b.c) || await ACCOUNTS.db.get(b.c).catch(e=>false))
        
        &&//...Check signature(SIG(RSApub+GUID)) to allow user to create account in <space>
        await VERIFY(b.d[0]+GUID,b.d[1],b.c)




        if(allow){

            //Create one hidden class and set default vals
            let acc={S:'',R:CONFIG.DEFAULT_ROLES,N:1}//Note:Due to  <N % by CONFIG.DEBOUNCE_MODULUS> start with 1,not 0,for instant start

            c.randomBytes(64,(e,r)=>{
                
                if(!e){
                    
                    acc.S=BASE64(r)//64 byte entropy SpaceId(SID) for communications Address(you) <-> Node
                    
                    //acc.TIME=new Date().getTime()

                    //ACCOUNTS.set(b.c,acc)

                    space.put(b.c,acc).catch(e=>'')

                    !a.aborted&&a.end(ENCRYPT(acc.S,b.d[0]))
    
                }else !a.aborted&&a.end('Bytes generation failed')
            
            })

        }else !a.aborted&&a.end('Verification failed')
                
    }),

    


    //TODO:Мб всё таки вернуть задержку во времени в рамках NewNetworks
    //0-RSA pubkey 1-signature
    spaceChange:a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async v=>{
        
        let b=await BODY(v,CONFIG.EXTENDED_PAYLOAD_SIZE)

        ACCOUNTS.get(b.c).then(async acc=>{
            
            if(acc&&await VERIFY(b.d[0]+GUID,b.d[1],b.c)){
                
                c.randomBytes(64,(e,r)=>{
                
                    if(!e){
                        
                        acc.S=BASE64(r)
                        
                        //acc.TIME=new Date().getTime()
    
                        ACCOUNTS.set(b.c,acc)
    
                        !a.aborted&&a.end(ENCRYPT(acc.S,b.d[0]))


                        //For future upgrading of Space protocol
                        //!Cloud heartbeat
                        // if(CONFIG.INFORM_WHEN_SPACE_CHANGE){
                
                        //     let alertThem=Object.values(CONFIG.CHANGE_PROCEDURE)

                        //     for(let i=0,l=alertThem.length;i<l;i++) SEND(alertThem[i].domain+'/csp',new MSG(b.c,alertThem[i].sid,'0'))
                    
                        // }
        
                    }else !a.aborted&&a.end('Bytes generation error')
                
                })

            }else !a.aborted&&a.end('Verification failed')
        
        }).catch(e=>!a.aborted&&a.end('No such acc or DB error'))
        
    }),





    


//_____________________________________________________________AUXILARIES________________________________________________________________________




    //[chainID,hostToAdd(initiator's valid and resolved host)]
    addNode:a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async v=>{

        let [chain,domain]=await BODY(v,CONFIG.PAYLOAD_SIZE),chainConfig=CONFIG.CHAINS[chain]
        

        if(chainConfig&&typeof domain==='string'&&domain.length<=256){
            
            //Add more advanced logic in future(e.g instant single PING request or ask controller if this host asked him etc.)
            let nodes=chains.get(chain).NEAR
            
            if(!(nodes.includes(domain) || chainConfig.PERMANENT_NEAR || chainConfig.MUST_SEND)){

                
                nodes.length<chainConfig.MAX_CONNECTIONS
                ?
                nodes.push(domain)
                :
                nodes[~~(Math.random() * nodes.length)]=domain//if no place-paste instead of random node



                !a.aborted&&a.end('OK')

            }else !a.aborted&&a.end('Domain already in scope')

        }else !a.aborted&&a.end('Wrong types')
    
    }),



    //Passive mode enabled by default    
    proof:a=>a.writeHeader('Access-Control-Allow-Origin','*').onAborted(()=>a.aborted=true).onData(async v=>{

        /*
        
        VERIFY signature and perform further logic
        Also,broadcast to the other nodes if signature is valid
        
        */

        let {chain,ticker,KLYNTAR_HASH,HOSTCHAIN_HASH,INDEX,SIG}=await BODY(v,CONFIG.PAYLOAD_SIZE),
        
            workflowOk=true//by default.Can be changed in case if our local collapse is higher than index in proof


        if(chains.has(chain) && !CONFIG.CHAINS[chain].CONTROLLER.ME && await VERIFY(KLYNTAR_HASH+INDEX+HOSTCHAIN_HASH+ticker,SIG,chain)){

            let alreadyHas=await chains.get(chain).HOSTCHAINS_DATA.get(INDEX+ticker).catch(e=>false)

            if(alreadyHas){
                
                !a.aborted&&a.end('OK')

                return

            }

            //If we're working higher than proof for some block we can check instantly
            QUANT_CONTROL[chain].COLLAPSED_INDEX>=INDEX
            &&
            await chains.get(chain).CONTROLLER_BLOCKS.get(INDEX).then(async controllerBlock=>
                
                workflowOk= ControllerBlock.genHash(chain,controllerBlock.a,controllerBlock.i,controllerBlock.p)===KLYNTAR_HASH
                            &&
                            await hostchains.get(chain).get(ticker).checkTx(HOSTCHAIN_HASH,INDEX,KLYNTAR_HASH,chain).catch(e=>false)

            ).catch(e=>
                
                //You also don't have ability to compare this if you don't have block locally
                LOG(`Can't check proof for \x1b[36;1m${INDEX}\u001b[38;5;3m on \x1b[36;1m${CHAIN_LABEL(chain)}\u001b[38;5;3m to \x1b[36;1m${ticker}\u001b[38;5;3m coz you don't have local copy of block. Check your configs-probably your STORE_CONTROLLER_BLOCKS is false`,'W')
                    
            )    

            //False only if proof is failed
            if(workflowOk){

                CONFIG.CHAINS[chain].WORKFLOW_CHECK.HOSTCHAINS[ticker].STORE//if option that we should locally store proofs is true
                &&
                chains.get(chain).HOSTCHAINS_DATA
                
                    .put(INDEX+ticker,{KLYNTAR_HASH,HOSTCHAIN_HASH,SIG})

                    .then(()=>chains.get(chain).HOSTCHAINS_DATA.put(ticker,{KLYNTAR_HASH,HOSTCHAIN_HASH,SIG,INDEX}))
                    
                    .then(()=>LOG(`Proof for block \x1b[36;1m${INDEX}\x1b[32;1m on \x1b[36;1m${CHAIN_LABEL(chain)}\x1b[32;1m to \x1b[36;1m${ticker}\x1b[32;1m verified and stored`,'S'))
                    
                    .catch(e=>LOG(`Can't write proof for block \x1b[36;1m${INDEX}\u001b[38;5;3m on \x1b[36;1m${CHAIN_LABEL(chain)}\u001b[38;5;3m to \x1b[36;1m${ticker}\u001b[38;5;3m`,'W'))


            }else{
                
                LOG(fs.readFileSync(PATH_RESOLVE('images/custom/fork.txt')).toString(),'F')

                LOG(`<WARNING>-found fork.Block \x1b[36;1m${INDEX}\x1b[31;1m on \x1b[36;1m${CHAIN_LABEL(chain)}\x1b[31;1m to \x1b[36;1m${ticker}`,'F')
                
                //Further logic.For example-send report to another host to call some trigger
                SEND_REPORT(chain,{height:INDEX,hostchain:ticker,hostchainTx:HOSTCHAIN_HASH})

            }
            

            !a.aborted&&a.end('OK')

            Promise.all(BROADCAST('/proof',{chain,ticker,KLYNTAR_HASH,HOSTCHAIN_HASH,INDEX,SIG},chain))


        }else !a.aborted&&a.end('Chain not supported or wrong signature')
    
    })

}