setTimeout(async()=>

    console.log(`Just dummy test custom script execution.1000th block is 
    
        ${JSON.stringify(await SYMBIOTE_META.CONTROLLER_BLOCKS.get(1000).catch(e=>'NOTHING'))}`
        
    ),5000
    
)