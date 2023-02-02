//Simple example of potential FH for services

let COLORS = {
    
    CD:`\u001b[38;5;219m`
   
}


export let LOG=(msg,msgColor)=>{

    console.log(`\u001b[38;5;154m`,`[${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]\u001b[38;5;99m(pid:${msg.pid||process.pid})`,COLORS[msgColor],msg.data,`\u001b[0m`)

}
