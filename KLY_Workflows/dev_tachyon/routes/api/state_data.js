import {BLOCKCHAIN_DATABASES, WORKING_THREADS} from '../../blockchain_preparation.js'

import {getFromState} from '../../common_functions/state_interactions.js'

import {KLY_EVM} from '../../../../KLY_VirtualMachines/kly_evm/vm.js'

import {CONFIGURATION, FASTIFY_SERVER} from '../../../../klyn74r.js'

import Web3 from 'web3'




/**## Returns the data directrly from state
 * 
 * 
 * ### Info
 * 
 *  This GET route returns data from state - it might be account, contract metadata, contract storage, KLY-EVM address binding and so on!
 * 
 * 
 * ### Params
 * 
 *  + 0 - shardID - Base58 encoded 32-byte Ed25519 public key which is also ID of shard
 *  + 1 - cellID - identifier of what you want to get - contract ID, account address(Base58 ed25519,BLS,LRS,PQC,TSIG, and so on), etc.
 * 
 * 
 * ### Returns
 * 
 *  + JSON'ed value
 * 
 *  
 * */
FASTIFY_SERVER.get('/state/:shardID/:cellID',async(request,response)=>{


    if(CONFIGURATION.NODE_LEVEL.ROUTE_TRIGGERS.API.FROM_STATE){

        let shardContext = request.params.shardID

        let cellID = request.params.cellID

        let fullID = shardContext === 'x' ? cellID : shardContext+':'+cellID

        let data = await BLOCKCHAIN_DATABASES.STATE.get(fullID).catch(()=>null)


        response

            .header('Access-Control-Allow-Origin','*')
            .header('Cache-Control','max-age='+CONFIGURATION.NODE_LEVEL.ROUTE_TTL.API.FROM_STATE)
        
            .send(data)
    
    }else response.send({err:'Trigger is off'})

})


// 0 - txid
FASTIFY_SERVER.get('/tx_receipt/:txID',(request,response)=>{

    if(CONFIGURATION.NODE_LEVEL.ROUTE_TRIGGERS.API.TX_RECEIPT){

        response
        
            .header('Access-Control-Allow-Origin','*')
            .header('Cache-Control',`max-age=${CONFIGURATION.NODE_LEVEL.ROUTE_TTL.API.TX_RECEIPT}`)
            

        BLOCKCHAIN_DATABASES.STATE.get('TX:'+request.params.txID).then(

            async txReceipt => {

                if(request.params.txID.startsWith('0x')){

                    let blockIdWithThisTx = await BLOCKCHAIN_DATABASES.STATE.get(`${txReceipt.originShard}:EVM_BLOCK_RECEIPT:${txReceipt.receipt.blockNumber}`).then(pointer=>pointer.klyBlock).catch(err=>err)

                    let formatCompatibleReceipt = {

                        blockID: blockIdWithThisTx,

                        order:0,

                        isOk: txReceipt.receipt.status === 1

                    }

                    response.send(formatCompatibleReceipt)

                } else response.send(txReceipt)

            }

        ).catch(err=>response.send({err}))


    }else response.send({err:'Route is off'})

})




FASTIFY_SERVER.get('/txs_list/:shardID/:accountID',async(request,response)=>{


    if(CONFIGURATION.NODE_LEVEL.ROUTE_TRIGGERS.API.FROM_STATE){

        let shardID = request.params.shardID

        let accountID = request.params.accountID

        let txsList = await BLOCKCHAIN_DATABASES.EXPLORER_DATA.get(`TXS_TRACKER:`+shardID+':'+accountID).catch(()=>({err:'Not found'}))


        response

            .header('Access-Control-Allow-Origin','*')
            .header('Cache-Control','max-age='+CONFIGURATION.NODE_LEVEL.ROUTE_TTL.API.FROM_STATE)

            .send(txsList)


    } else response.send({err:'Trigger is off'})

})




FASTIFY_SERVER.get('/pool_stats/:poolID',async(request,response)=>{


    if(CONFIGURATION.NODE_LEVEL.ROUTE_TRIGGERS.API.POOL_STATS){

        // Take the info related to pool based on data in VT(verification thread) and AT(approvement thread)

        let poolOriginShard = await getFromState(`${request.params.poolID}_POINTER`)

        let poolMetadata = await getFromState(`${poolOriginShard}:${request.params.poolID}`)

        let poolStorage = await getFromState(`${poolOriginShard}:${request.params.poolID}_STORAGE_POOL`)

        let poolPubKey = request.params.poolID.split('(')[0]

        let isActiveValidator = WORKING_THREADS.APPROVEMENT_THREAD.EPOCH.poolsRegistry.includes(poolPubKey)

        let isCurrentQuorumMember = WORKING_THREADS.APPROVEMENT_THREAD.EPOCH.quorum.includes(poolPubKey)

        response

            .header('Access-Control-Allow-Origin','*')
            .header('Cache-Control','max-age='+CONFIGURATION.NODE_LEVEL.ROUTE_TTL.API.POOL_STATS)
        
            .send({isActiveValidator,isCurrentQuorumMember,poolOriginShard,poolMetadata,poolStorage})

            
    }else response.send({err:'Trigger is off'})

})




FASTIFY_SERVER.get('/account/:shardID/:accountID',async(request,response)=>{


    if(CONFIGURATION.NODE_LEVEL.ROUTE_TRIGGERS.API.FROM_STATE){

        let shardID = request.params.shardID

        let accountID = request.params.accountID

        let data = await BLOCKCHAIN_DATABASES.STATE.get(shardID+':'+accountID).catch(()=>({err:'Not found'}))

        if(accountID.startsWith('0x') && accountID.length === 42){

            let account = await KLY_EVM.getAccount(accountID).catch(()=>null)

            if(account){

                let balanceInKlyUnits = Number(Web3.utils.fromWei(account.balance.toString(),'ether'))

                let nonce = Number(account.nonce)

                data = {

                    type:"eoa",
                    balance:balanceInKlyUnits,
                    uno:0,
                    nonce,
                    gas:0

                }

            }else data = {}

        } else data = await BLOCKCHAIN_DATABASES.STATE.get(shardID+':'+accountID).catch(()=>({err:'Not found'}))


        response

            .header('Access-Control-Allow-Origin','*')
            .header('Cache-Control','max-age='+CONFIGURATION.NODE_LEVEL.ROUTE_TTL.API.FROM_STATE)
        
            .send(data)
    
    }else response.send({err:'Trigger is off'})

})