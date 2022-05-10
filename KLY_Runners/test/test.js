import vm from 'vm'

const x = 1;

const context = { x: 2 };
vm.createContext(context); // Contextify the object.

const code = `x += 40;

var y = 17;

y+=10;

`;
// `x` and `y` are global variables in the context.
// Initially, x has the value 2 because that is the value of context.x.
vm.runInContext(code, context);


// let script=new vm.Script(`

// for(let i=0;i<10;i++){

//     console.log('DA')
//     x+=100;

// }


// `)

// script.runInContext(context)

// console.log(context.x); // 42
// console.log(context.y); // 17

// console.log(x); // 1; y is not defined.

