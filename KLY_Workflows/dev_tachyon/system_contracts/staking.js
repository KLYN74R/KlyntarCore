/* eslint-disable no-unused-vars */
import { WORKING_THREADS } from '../blockchain_preparation.js'
import {getUserAccountFromState} from '../common_functions/state_interactions.js'




export let gasUsedByMethod=methodID=>{

    if(methodID==='burnAssetsToGetStakingTicket') return 10000

}




export let CONTRACT = {


    /*
    
        Method to burn KLY / UNO to make it possible to stake on some pool

        transaction.payload.params is:

        {
            poolPubKey:<Format is Ed25519>,
            randomChallenge:<256-bit hex string used to prevent replay attacks>,
            amount:<amount in KLY or UNO> | NOTE:must be int - not float
            units:<KLY|UNO>
        }
    
    */
    burnAssetsToGetStakingTicket:async (originShard,transaction)=>{

        let txCreatorAccount = await getUserAccountFromState(originShard+':'+transaction.creator)

        let {poolPubKey,randomChallenge,amount,units} = transaction.payload.params

        let epochHandler = WORKING_THREADS.VERIFICATION_THREAD.EPOCH


        if(txCreatorAccount && typeof poolPubKey === 'string' && typeof randomChallenge === 'string' && typeof units === 'string' && typeof amount === 'number'){
            
            if(units === 'kly' && amount <= txCreatorAccount.balance) txCreatorAccount.balance -= amount

            else if (units === 'uno' && amount <= txCreatorAccount.uno) txCreatorAccount.uno -= amount

            return {isOk:true, extraData:{poolPubKey,recipient:transaction.creator,randomChallenge,validUntill:epochHandler.id+100,amount,units}}

        } else return {isOk:false, reason:'No such account or wrong input to function of contract'}

    }
        
}