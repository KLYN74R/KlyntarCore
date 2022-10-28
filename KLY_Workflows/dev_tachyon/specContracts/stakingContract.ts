/*

Simple AssemblyScript contract for distribution rewards amongs stakers in pool based on % they've invested

Max required size for pool defined in WORKFLOW_OPTIONS


*/

//Import function to manage staking storage
// dev_tachyon creates special storage for distribution contract
// So, to allow stakers to withdraw their stakes(and rewards) back
@external("based","POOL_STORAGE")
declare function POOL_STORAGE(address:string,value:i32): boolean;

//Also, import function to check if invested resources is enough based on type(KLY or UNO). Compare with CONFIG.SYMBIOTE.MANIFEST.WORKFLOW_OPTIONS.VALIDATOR_STAKE and MINIMAL_STAKE
// As we sad before, only integer positive values allowed
@external("based","CHECK_IF_POOL_DEPOSIT_IS_OK")
declare function CHECK_IF_POOL_DEPOSIT_IS_OK(investorAddress:string,value:i32,resourceType:string): boolean;




export function depositToPool(address:string,value:i32,resourceType:string) {

    if(CHECK_IF_POOL_DEPOSIT_IS_OK(address,value,resourceType)){

        //If ok - put to storage

        POOL_STORAGE(address,value)

    }

}


export function withdraw(address:string) {

    //Implement here


}