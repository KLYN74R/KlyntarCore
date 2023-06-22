
//Just log
@external("network_module", "logMyIP")
declare function logMyIP(): void;

//Get as string
@external("network_module", "getMyIP")
declare function getMyIP(): string;



export function getQwerty(payload:string): string {

    logMyIP();

    return "Payload:"+ payload

}

export function getConcat(payload:string): string {

    let myIP:string = getMyIP();

    return "Concat: " + payload + myIP

}