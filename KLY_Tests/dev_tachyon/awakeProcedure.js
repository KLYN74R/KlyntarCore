/*


Test to send the special operation to make IS_STOPPED=false for appropriate subchain

In our local testnet(v0 and v1) we have 4 nodes

    [+] 3 pools(3 separate pools which forms 3 subchains)

        N1 = 7GPupbq1vtKUgaqVeHiDbEJcxS7sSjwPnbht4eRaDBAEJv8ZKHNCSu2Am3CuWnHjta
        N2 = 75XPnpDxrAtyjcwXaATfDhkYTGBoHuonDU1tfqFc6JcNPf5sgtcsvBRXaXZGuJ8USG
        N3 = 61TXxKDrBtb7bjpBym8zS9xRDoUQU6sW9aLvvqN9Bp9LVFiSxhRPd9Dwy3N3621RQ8

    [+] Default node(generate blocks:false)

        N4 = 6YHBZxZfBPk8oDPARGT4ZM9ZUPksMUngyCBYw8Ec6ufWkR6jpnjQ9HAJRLcon76sE7

The situation:

    61TXxKDrBtb7bjpBym8zS9xRDoUQU6sW9aLvvqN9Bp9LVFiSxhRPd9Dwy3N3621RQ8 is AFK and was skipped(after STAGE_1 and STAGE_2 SKIP_PROCEDURE). The skip stats is

    {
        INDEX: 1216,
        HASH: 'aad6325b32578db10affea654de9138adae72a62fd62efce89d569e356cddd66'
    }

    So, the motivation is to build the STOP_VALIDATOR special tx, send via route and add to checkpoint to "unfreeze" the N3 from the same position(1216+1=1217 block)


    ************************ STATE OF MEMPOOL AFTER SKIP PROCEDURE ************************

    Map(1) {
    
    '21b04d2ff9d9154f8acbffb3fc7a24d0626275ab37fe152a21ecae8ae74db014' => {
   
        type: 'STOP_VALIDATOR',
        payload: {
            stop: true,
            subchain: '61TXxKDrBtb7bjpBym8zS9xRDoUQU6sW9aLvvqN9Bp9LVFiSxhRPd9Dwy3N3621RQ8',
            index: 1216,
            hash: 'aad6325b32578db10affea654de9138adae72a62fd62efce89d569e356cddd66'
        }

    }

}


[TEST STATUS:✅]


    ************************ SEND THE SAME TX WITH "UNFREEZE" VALUE ************************

    [+] For this we need to make payload.stop=false
    [+] We need to send to POST /special_operations this object

    {
        type:'STOP_VALIDATOR'
    
        payload:{
            stop:false,
            subchain:<MY_BLS_PUBKEY>
        }
    
    }

    [+] Then, mempool will be updated

*/


import fetch from 'node-fetch'


let unfreezeSpecialOperation = {

    type:'STOP_VALIDATOR',
    
    payload:{
        stop:false,
        subchain:'61TXxKDrBtb7bjpBym8zS9xRDoUQU6sW9aLvvqN9Bp9LVFiSxhRPd9Dwy3N3621RQ8'
    }

}


let optionsToSend = {

    method:'POST',
    body:JSON.stringify(unfreezeSpecialOperation)

}


fetch('http://localhost:6666/special_operations',optionsToSend).then(r=>r.text()).then(resp=>console.log('STATUS => ',resp))
fetch('http://localhost:6665/special_operations',optionsToSend).then(r=>r.text()).then(resp=>console.log('STATUS => ',resp))
fetch('http://localhost:6664/special_operations',optionsToSend).then(r=>r.text()).then(resp=>console.log('STATUS => ',resp))