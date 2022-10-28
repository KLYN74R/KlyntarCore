global.SPECIAL_CONTRACTS=new Map()


let set = ['aliases','mintUnobtanium','deployService']

for(let filename of set){

    await import(`./${filename}.js`).then(func=>SPECIAL_CONTRACTS.set(filename,func))

}