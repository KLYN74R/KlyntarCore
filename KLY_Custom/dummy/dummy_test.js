import {chains} from '../../klyn74r.js'

setTimeout(async()=>

    console.log(`Just dummy test custom script execution.1000th block is 
    
        ${JSON.stringify(await chains.get('q0Bl2spIOIBhA5pviv6B69RdBcZls7iy+y4Wc3tgSVs=').CONTROLLER_BLOCKS.get(1000).catch(e=>'NOTHING'))}`
        
    ),5000
    
)