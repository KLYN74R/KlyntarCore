import fs from 'fs'

global.__dirname = await import('path').then(async mod=>
  
    mod.dirname(
      
      (await import('url')).fileURLToPath(import.meta.url)
      
    )

)

let banner=fs.readFileSync(__dirname+'/post.txt').toString('utf-8')
            
            .replaceAll('█','\u001b[38;5;50m█\x1b[0m')            
            .replaceAll('#','\x1b[36;1m#\x1b[0m')
            
            .replaceAll('[STATUS]','\u001b[38;5;23m[STATUS]\x1b[0m')
            .replaceAll('by KlyntarTeam','\u001b[38;5;83mby KlyntarTeam\x1b[0m')
            .replaceAll('#','\x1b[31m#\x1b[36m')+'\x1b[0m\n'


console.log(banner)