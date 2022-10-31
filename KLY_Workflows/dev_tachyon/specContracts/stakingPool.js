export default {

    /*
    
    Used by pool creators to create contract instance and a single storage with id="POOL"
    
    */
    constructor:async payload=>{

        

    },

    /*
     
    Method to delegate your assets to some validator | pool

    Payload

    {
        pool:<id of special contract - BLS validator's pubkey'>
        amount:<amount in KLY or UNO> | NOTE:must be int - not float
        type:<KLY|UNO>
    }
    
    */
    
    stake:async payload=>{

        

    },

    //Used to withdraw
    unstake:async payload=>{

        

    },

    //Allow pool authority to change percent for him and stakers
    changePercent:async payload=>{

        

    },

}