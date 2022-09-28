// const date1 = new Date("Wed, 27 July 2016 13:30:00");
// const date2 = new Date("Wed, 27 July 2016 07:45:00 UTC");
// const date3 = new Date("27 July 2016 13:30:00 UTC+05:45");


// console.log(date1.getTime())
// console.log(date2.getTime())
// console.log(date3.getTime().toString())
// console.log(date3.getTime().toLocaleString())

// console.log(new Date().toLocaleDateString('en-GB'))
// console.log(new Date().toLocaleDateString('en-US'))


//__________________________________________ FOR TACHYON __________________________________________

const startOfDay = new Date();
startOfDay.setUTCHours(0,0,0,0);
console.log(startOfDay.getTime());

const endOfDay = new Date();
endOfDay.setUTCHours(23,59,59,999);
console.log(endOfDay.getTime());

console.log(new Date().getTime())
console.log(Date.now())

console.log(new Date(Date.now()).toUTCString())