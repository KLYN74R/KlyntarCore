/* eslint-disable no-unused-vars */
import {getUserAccountFromState} from '../common_functions/state_interactions.js'




export let gasUsedByMethod=methodID=>{

    if(methodID==='burnAssetsToGetStakingTicket') return 10000

}




export let CONTRACT = {


    /*
    
        Method to burn KLY / UNO to make it possible to stake on some pool

        transaction.payload.params[0] is:

        {
            poolPubKey:<Format is Ed25519>,
            recipientNextNonce:<next nonce of target address - need it to prevent replay attacks>,
            amount:<amount in KLY or UNO> | NOTE:must be int - not float
            units:<KLY|UNO>
        }
    
    */
    burnAssetsToGetStakingTicket:async (originShard,transaction)=>{

        let txCreatorAccount = await getUserAccountFromState(originShard+':'+transaction.creator)

        let {poolPubKey,recipientNextNonce,amount,units} = transaction.payload.params[0]


        if(txCreatorAccount && typeof poolPubKey === 'string' && typeof recipientNextNonce === 'number' && typeof units === 'string' && typeof amount === 'number' && amount <= txCreatorAccount.balance){

            
            if(units === 'kly' && amount <= txCreatorAccount.balance) txCreatorAccount.balance -= amount

            else if (units === 'uno' && amount <= txCreatorAccount.uno) txCreatorAccount.uno -= amount


            return {isOk:true, extraData:{poolPubKey,recipient:transaction.creator,recipientNextNonce,amount,units}}

        } else return {isOk:false, reason:'No such account or wrong input to function of contract'}

    }
        
}