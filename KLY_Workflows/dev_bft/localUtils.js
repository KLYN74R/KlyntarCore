export let COLORS = {
    C:'\x1b[0m',
    T:`\u001b[38;5;${process.env.KLY_MODE==='main'?'23':'202'}m`, // for time view
    F:'\x1b[31;1m', // red(error,no collapse,problems with sequence,etc.)
    S:'\x1b[32;1m', // green(new block, exported something, something important, etc.)
    W:'\u001b[38;5;3m', // yellow(non critical warnings)
    I:'\x1b[36;1m', // cyan(default messages useful to grasp the events)
    CB:'\u001b[38;5;200m',// ControllerBlock
    CD:`\u001b[38;5;50m`,//Canary died
    GTS:`\u001b[38;5;m`,//Generation Thread Stop
    CON:`\u001b[38;5;168m`//CONFIGS
}




//Segregate console and "in-file" logs can be occured by directing stdin to some "nnlog" file to handle logs
//Notify file when ENABLE_CONSOLE_LOGS to handle windows of "freedom"(to know when you off logs and start again)
export let LOG=(msg,msgColor)=>{

    CONFIG.DAEMON_LOGS && console.log(COLORS.T,`[${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}]\u001b[38;5;99m(pid:${process.pid})`,COLORS[msgColor],msg,COLORS.C)

}