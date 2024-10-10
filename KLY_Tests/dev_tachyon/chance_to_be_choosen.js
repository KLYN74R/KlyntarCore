let {createRequire} = await import('module');

let math = createRequire(import.meta.url)('mathjs');


let binom = (n,k) => math.combinations(n, k)


const TOTAL_NUMBER_OF_VALIDATORS = 100
const VALIDATORS_BY_SOMEONE = 10
const QUORUM_SIZE = 21

// Prob that no one your validator will be choosen
const P_no_at_all = binom(TOTAL_NUMBER_OF_VALIDATORS - VALIDATORS_BY_SOMEONE, QUORUM_SIZE) / binom(TOTAL_NUMBER_OF_VALIDATORS, QUORUM_SIZE)

// Prob that at least one your validator will be choosen to quorum
const P_at_least_one = 1 - P_no_at_all

console.log(P_at_least_one)
