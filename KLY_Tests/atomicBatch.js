// import l from 'level'

// let db = l('TEST')

// let batch = db.batch()

// await batch.put('A','VALUE_A')

// db.createReadStream().on('data',v=>console.log('First batch => ',v))

// batch.put('B','VALUE_B')
// batch.put('C','VALUE_C')

// await batch.write()

// db.createReadStream().on('data',v=>console.log('After commit => ',v))

//=============================================Test2=============================================

// import l from 'level'

// let db = l('TEST')

// db.createReadStream().on('data',v=>console.log('After commit => ',v))

// let batch = db.batch()

// await batch.put('A','VALUE_A')

// process.exit(1)

//=============================================Test3 - Performance=============================================

import l from 'level'

let db = l('TEST')

// let batch = db.batch()

// for(let i=0;i<100000;i++){

//     batch.put('G1MAhqG3ytEwWAVZz9wEut6BHa3yce6hRe7gCYZwNVZD'+i,'=============================================Test3 - Performance=============================================')

// }

// await batch.write()

db.createReadStream().on('data', v => console.log('After commit => ', v))
