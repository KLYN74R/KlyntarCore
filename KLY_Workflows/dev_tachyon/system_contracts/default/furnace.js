import {getUserAccountFromState} from '../../common_functions/state_interactions.js'




export let gasUsedByMethod=methodID=>{

    if(methodID==='burnAssetsToGetStakingTicket') return 10000

}




export let CONTRACT = {


    /*
    
        Method to burn KLY / UNO to make it possible to stake on some pool

        transaction.payload.params is:

        {
            poolPubKey:<Format is Ed25519>,
            amount:<amount in KLY or UNO> | NOTE:must be int - not float
            units:<KLY|UNO>
        }
    
    */
    burnAssetsToGetStakingTicket:async (originShard,transaction)=>{

        let txCreatorAccount = await getUserAccountFromState(originShard+':'+transaction.creator)

        let {poolPubKey,amount,units} = transaction.payload.params


        if(txCreatorAccount && typeof poolPubKey === 'string' && typeof units === 'string' && typeof amount === 'number'){
            
            if(units === 'kly' && amount <= txCreatorAccount.balance){

                amount = Number(amount.toFixed(9))

                txCreatorAccount.balance -= amount

                txCreatorAccount.balance -= 0.000000001

            } 

            else if (units === 'uno' && amount <= txCreatorAccount.uno){

                amount = Number(amount.toFixed(9))

                txCreatorAccount.uno -= amount

                txCreatorAccount.uno -= 0.000000001

            } 

            return {isOk:true, extraData:{poolPubKey,recipient:transaction.creator,nonce:transaction.nonce,amount,units}}

        } else return {isOk:false, reason:'No such account or wrong input to function of contract'}

    }
        
}