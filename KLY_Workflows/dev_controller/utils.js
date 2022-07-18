/**# Event initiator account
* 
* Symbiote level data.Used when we check blocks
* Here we read from cache or get data about event initiator from state,push to cache and return
*/
export let GET_SYMBIOTE_ACC=(addr,symbiote)=>

   //We get from db only first time-the other attempts will be gotten from ACCOUNTS
   symbiotes.get(symbiote).ACCOUNTS.get(addr)||symbiotes.get(symbiote).STATE.get(addr)
   
   .then(ACCOUNT=>
       
       //Get and push to cache
       ACCOUNT.T==='A' && symbiotes.get(symbiote).ACCOUNTS.set(addr,{ACCOUNT,NS:new Set(),ND:new Set(),OUT:ACCOUNT.B}).get(addr)
   
   ).catch(e=>false)