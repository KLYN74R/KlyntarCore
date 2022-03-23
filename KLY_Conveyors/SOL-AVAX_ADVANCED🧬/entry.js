let COLORS = {
    
    CD:`\u001b[38;5;50m`
   
},



LOG=(msg,msgColor)=>{

    console.log(`\u001b[38;5;196m`,`[${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]`,COLORS[msgColor],msg,`\u001b[0m`)

}


setInterval(()=>LOG('Dummy example of SOL-AVAX_ADVANCED conveyor','CD'),10000)
