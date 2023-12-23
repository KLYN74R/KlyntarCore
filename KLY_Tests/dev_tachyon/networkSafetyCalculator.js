function factorialBigInt(n) {
    
  
    let result = BigInt(1);
    for (let i = BigInt(2); i <= n; i++) {
      result *= i;
    }
  
    return result;
  }
  

let getKFromN = (k,n) => {

    return factorialBigInt(n)/(factorialBigInt(k)*factorialBigInt(n-k))

}


// console.log(getKFromN(21,1000))

const NUMBER_OF_VALIDATORS = 1660

const QUORUM_SIZE = 256

const THIRD_PART_OF_QUORUM = Math.floor(QUORUM_SIZE*0.33)

const BAD_ACTOR_CONTROL_PERCENTAGE = 0.2

const NUMBER_OF_BAD_ACTORS = Math.floor(NUMBER_OF_VALIDATORS * BAD_ACTOR_CONTROL_PERCENTAGE)

const NUMBER_OF_NORM_ACTORS = NUMBER_OF_VALIDATORS - NUMBER_OF_BAD_ACTORS


let totalChanceOfBad = 0

let totalNumberOfPossibleCases = getKFromN(BigInt(QUORUM_SIZE),BigInt(NUMBER_OF_VALIDATORS))


// Calculate the probability that more than third part will be bad actors

let limit = NUMBER_OF_BAD_ACTORS < QUORUM_SIZE ? NUMBER_OF_NORM_ACTORS : QUORUM_SIZE


if(THIRD_PART_OF_QUORUM > NUMBER_OF_BAD_ACTORS){

    console.log('Total number of bad actors in general is less than third party of quorum, so impossible to take control over network')

}else{

    for(let numberOfBadActorsInCurrentQuorum = BigInt(THIRD_PART_OF_QUORUM) ; numberOfBadActorsInCurrentQuorum <= BigInt(limit) ; numberOfBadActorsInCurrentQuorum++){

        if(numberOfBadActorsInCurrentQuorum > BigInt(NUMBER_OF_BAD_ACTORS)) break

        let casesWhenMoreThanOneThirdBadActors = getKFromN(numberOfBadActorsInCurrentQuorum,BigInt(NUMBER_OF_BAD_ACTORS))
    
        let numberOfNormalActorsInThisQuorum = BigInt(QUORUM_SIZE) - numberOfBadActorsInCurrentQuorum
    
        let casesWhenNorm = getKFromN(numberOfNormalActorsInThisQuorum,BigInt(NUMBER_OF_NORM_ACTORS))
    
        let chance = Number(casesWhenMoreThanOneThirdBadActors * casesWhenNorm) / Number(totalNumberOfPossibleCases)
    
        console.log(`Bad actors: ${numberOfBadActorsInCurrentQuorum} | Norm actors: ${numberOfNormalActorsInThisQuorum} | Chance: ${chance*100} %`)
    
        totalChanceOfBad += chance * 100
    
    }
    
    console.log('Final value of chance => ',totalChanceOfBad)
    

}