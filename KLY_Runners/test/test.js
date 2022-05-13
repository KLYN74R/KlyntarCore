import vm from 'vm'

//_________________________________ CONTEXT CREATING _________________________________

const x = 1;

const context = { x: 2 };
vm.createContext(context); // Contextify the object.

//_________________________________ SNIPPET EXECUTION _________________________________
const code = `x += 40;

var y = 17;

y+=10;

`;
// `x` and `y` are global variables in the context.
// Initially, x has the value 2 because that is the value of context.x.
vm.runInContext(code,context);


console.log(context.x); // 42
console.log(context.y); // 17


//_________________________________ FUNCTION EXECUTION _________________________________

let script=new vm.Script(`

    function add(a, b) {

        let q=10

        for(let i=0;i<10;i++) q++

        return a + b + q;

    }
  
    x = add(1,2);

    let w=30;

    for(let i=0;i<10;i++) x+=w

`)

//_________________________________ CONTEXT CREATING _________________________________

script.runInContext(context)

console.log(context.x); // 42
console.log(context.y); // 17

// console.log(x); // 1; y is not defined.

