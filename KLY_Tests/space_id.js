/**
 * 
 * @Vlad@ Chernenko 23.07.-1
 * 
 * 
 * Test to set SID with some node
 * 
 *   Available test credentials(set your own):
 *   0st -> M5IgUgGo5ej8epvnRdPfDQ9meZXMN37g14+iyq59UgvQIxe6hmxIOVPZTbG3GRSFSF1AregN8a7UWa0eZWRzbg==
 *   1st(after one change) -> V/gdq9jindJcu9aA4skHvtCedyhWa8eDm4xQQCnOPfoUYHumq/5r2KoieYRvQhP7NAhmaRsL9MYzoWwYJ0+D7g==
 * 
 * 
 *  
 * 
 */




import {VERIFY,SIG,DECRYPT} from './crypto_utils.js'
import fetch from 'node-fetch'




//_________________________________________________________VALUES & FUNCTIONS POOL_________________________________________________________


let {GUID}=await fetch('http://localhost:8888/i').then(r=>r.json()).catch(e=>console.log(`Can't get GUID`)),


KES={
    pub: 'EHYLgeLygJM21grIVDPhPgXZiTBF1xvl5p7lOapZ534=',
    prv: 'MC4CAQAwBQYDK2VwBCIEIKN4J4SGoeRJuZG3bisJbSQFmqSG7XC0HFqnbbqGLX3Q'
},


RSA={
    
        publicKey: '-----BEGIN PUBLIC KEY-----\n' +
          'MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAvnpSajF5WOh3Hr9ywB67\n' +
          '8F3wqvJ7+HZC1gqkYlHYxmnQ4UXoJ311VkEoGZ7RFiruaPNmhFD6R+q2O9aSyfuC\n' +
          'f4Avqr4PtdNNDcso49q4gVVmFIr+LZthT5Lf6WKMds8Dn+Gjh7mYPpDukUSU3THV\n' +
          '6DSO5Gi5NyBeFXYr94bpc+wRkFIab8/mTyBbRoHl816kvFp7SAIWiApcZ0oR6IK5\n' +
          'Q5dDoiU/PKeB8TOlX2LRLIESR09TvzLOmzFoQBFlteGdAJ18gczil5OD17jRHeGP\n' +
          'OzTl+tWDQtUjOAjhgVboeIviOynakm5E5uOopUNVZmWAal3OELjBFnRWZTiMp8qN\n' +
          'vaCwv7jS4IwdgiuEA1vQwtABiKd56FkAqVhqaS59Zn71nkUsjdNSHgf6JtYI4Ky0\n' +
          'r3kkDPNm0y5N3bXZoaYtim6Ka+OHjjupzXiCwo2po707Dyg2ERF6/d0hd2affFMj\n' +
          'ZHXYx57g6QRU3pVzW5uARMw/dsVUbsjTQLis53JTvc6XUpagY13k45kRL2XtVCzP\n' +
          'dTsaMQM20yFseaP7LaA2RQ39moWb1Iu+IagH1HW1CN6AHD161OJcMLjbjc7KbWEG\n' +
          'CEOLL+1qrdtanMTB7kDBLvRzl208YhczQqV+kELlzfOkrA6ALsw9j7TH2cSNIbb9\n' +
          'hnom/HM+ctBm/6/dBsWUUSMCAwEAAQ==\n' +
          '-----END PUBLIC KEY-----\n',

        privateKey: '-----BEGIN PRIVATE KEY-----\n' +
          'MIIJQwIBADANBgkqhkiG9w0BAQEFAASCCS0wggkpAgEAAoICAQC+elJqMXlY6Hce\n' +
          'v3LAHrvwXfCq8nv4dkLWCqRiUdjGadDhRegnfXVWQSgZntEWKu5o82aEUPpH6rY7\n' +
          '1pLJ+4J/gC+qvg+1000Nyyjj2riBVWYUiv4tm2FPkt/pYox2zwOf4aOHuZg+kO6R\n' +
          'RJTdMdXoNI7kaLk3IF4Vdiv3hulz7BGQUhpvz+ZPIFtGgeXzXqS8WntIAhaIClxn\n' +
          'ShHogrlDl0OiJT88p4HxM6VfYtEsgRJHT1O/Ms6bMWhAEWW14Z0AnXyBzOKXk4PX\n' +
          'uNEd4Y87NOX61YNC1SM4COGBVuh4i+I7KdqSbkTm46ilQ1VmZYBqXc4QuMEWdFZl\n' +
          'OIynyo29oLC/uNLgjB2CK4QDW9DC0AGIp3noWQCpWGppLn1mfvWeRSyN01IeB/om\n' +
          '1gjgrLSveSQM82bTLk3dtdmhpi2Kbopr44eOO6nNeILCjamjvTsPKDYREXr93SF3\n' +
          'Zp98UyNkddjHnuDpBFTelXNbm4BEzD92xVRuyNNAuKznclO9zpdSlqBjXeTjmREv\n' +
          'Ze1ULM91OxoxAzbTIWx5o/stoDZFDf2ahZvUi74hqAfUdbUI3oAcPXrU4lwwuNuN\n' +
          'zsptYQYIQ4sv7Wqt21qcxMHuQMEu9HOXbTxiFzNCpX6QQuXN86SsDoAuzD2PtMfZ\n' +
          'xI0htv2Geib8cz5y0Gb/r90GxZRRIwIDAQABAoICAQC+cuGqahMxkSVhafybGV/C\n' +
          'Yrr6wX6wm9YR2wwnfjxnjm+afmIz8d37QySMEV5vcrdz2kIbdDf65jQVOmMEb2Q4\n' +
          'hXujlWtx2nbFnucgg5VNQ4zQZ3TjNuOiQ3F8EdvuAuhV2K7ASxJtJE5UkyTg0S5W\n' +
          'gQ6KVCc0djl77e7iDFOpY1TgXyctuspFPU3l/oVjw7Kk3Tc8dVH/7ZQcdlPXjbUd\n' +
          'XsXx/pnu1HE5MPFdoRkSDW+wOyG6H1uykkDxJjPzGkT3038k7S12brk5XQJBhUDH\n' +
          '6wkztn4Kub8ADOkkgDfqJ7soep2fIX/k96Wsr9lYi45NS8N4trHg+KtVg6gnMIBs\n' +
          'avaaxq3i1Yw6xighfh+wvhGJkYxtmJ1tTnrI0I5Lg8sdA02IzC/oIUVKGqY2as1b\n' +
          'o1FgMP0Rg67MVJi+F04Zc95zK0mqZ/EG+70txUk0r3jj5G1PxIWf/eH2vZsORsvz\n' +
          '3WnZAfclhLxqGyv9JEhI0JdBc0Dfwl7LskyodJoPLSYq2CERTHsEzgjmApoWXkm7\n' +
          'NaRgfM7LydxX520tfmvX5jMktY2ZNm/PB7RN6sUSlUHNbfA/BI0VHaLhtx+wOIbJ\n' +
          'BOIhgD6wWBh9HEFg4YFyoNiwyeyp5N25OOOS5aBhaDLXpVl2aAR0fjnptU+ngX57\n' +
          'wnIIHbgEpNdDeOxsN3Pr2QKCAQEA4Ev1WX+T183jx+/aYfNJ6BmJN5sT3EH/K/7x\n' +
          'seehdwfiadG00eSOuJzCcnKtOlcGOxxgo3JbkHjM/l7a6Dw6YfgUkjALT3IfZDbV\n' +
          'xgKTAHLHKCT4shzuiJtHKAELg9G/u9ban6zcUskw/rTsOkYgZe2ao5oNV+dN1mJC\n' +
          '4tpaeLiY4TKEvFCDjzG3+HAd6wIeOlj2bgzQNjzMW5vrhZFr+6VUG0mlJDtLRamS\n' +
          'Kwpa28v/vMeckJQRAoV25ICHBhirsyg1yZCYs6sEw/JAJcp5Ynsgwwpn9/IKpiBe\n' +
          'e7Us9hXUlClLw86+BPbKwSXr5lCrw/aJY8e3/sXToSY9MDAKzwKCAQEA2WalssCS\n' +
          'CFCCGTKj5e6WpDFWYNdOE/n1VifX0KGdYHI3tUr2WLzsyHk6/jFR1WteSLgJANlt\n' +
          'Kbaroof3hJwbS7+o33isZRF+z95baxPVlwZg0Z9CLQDliowh1IrqPbxL0IQBJhlD\n' +
          'RJTqEkiu7TCi9+ToQqU2ryyVFuYjRatHT60p+RRWDjrgm1bglK9+DfNq2BQ2XtTR\n' +
          'U8k46oLgb5x/dSa0w4EDSOy9o/w7OVgUwPxqW7I+VDIbxXqf2RjkSaO/bjGgBU7R\n' +
          'q4dlYkmeQYW8dusxkCab52mjVIdkcMVQLyNV2pcpiW5+KjL0hT9pmVjrgdnRdAgh\n' +
          'kWIBhggWTTaZbQKCAQAB0Tu8rObywa1Nymi3kHQR2FsfQzdm+nXp0lf8/AZ34213\n' +
          'NAbGCJcLceG1ca5roZbgVbuGt398bS4kBXq6lPpYHt1zzcXZr/AHLNaQkybDwypP\n' +
          '7fTB5LAeFTv/W/rO550pFXWSA6GJXi3ycl7TngvXJ5SwLKhdBPfBe+xU0DYZck1y\n' +
          'zaj7qZ9XQqzd63Kim9LI4D2m6J2rQtTZDStcWrBISq+ixPb8kypp9xTDGoNf8ogw\n' +
          '7GEdXsXAgnpTIaN2bi699d5xsqU6F3GjcMwKQli3bo32ZpgvDxv8+pgpYm9p0wV0\n' +
          '6dy+SmeJvMIpzHfb1t19afr0/wJDozCyxo+KW2lLAoIBACygapEoAJIeXKZpg8V2\n' +
          'VYv86LtWVxu4qsj1wtJ76n9a0t6vNaR/m6eHYzm8zAygTqlkxcxb1ZHDgrYJbSDW\n' +
          'nq/M9xBwiArzLXHkNiXj22t2DrfZFk+AqJ3pKCSmI3FqzrFN96Jneyx/2RDJxMbB\n' +
          'viJe5eKQYYpR/4TE1ya9AxVy+XO83fFr2qFokw9SevDIL/2NIKAU1ad6Xemd1g5z\n' +
          'NKLKwD6FpDP7DO61nz6lOxVmezq5exvzcUn3YwrAllQbffdTzoJobJfmYkRr0kWm\n' +
          '+0n5+6GYm1ZElBeM92xCxLP4b+5AK3Gfsdxdu14C511oKGfuW5WS+bkLQj7OOC2/\n' +
          'cH0CggEBAMw6amwwBv/vZNtYWEhN/dJPXbhn1ijsZRw750A5WqVo3t0A1ABdaH/h\n' +
          'cdMC5GhHiJhb6edROiFBO8zlIKTcEEWamhE5+dlEQtleapTb9V406h1pGs6H4U9+\n' +
          'Caykqf2xHBKmDhGf8o9qNjumU1HAdWeck4483BSlh2qB7mZVvzRU92hzvebfngRj\n' +
          'qLZax254mvNFjp80fuHYgA2/n7nMUDYyGrXXnz+GhDONvvMe/pPTxIpSU45MiHn4\n' +
          'cHzzBNTeJK311g1nKcxRei3OwiUyxb2XcldpRQg4Ic1xM36vQFCFJeh10w+ZyI8A\n' +
          'qWFDkiffgU6nqbdYFyQVYbR/AlQmtuQ=\n' +
          '-----END PRIVATE KEY-----\n'
    },





/*

****************************************************FIRST BYTES OF EACH KEYPAIR ED25519***********************************************
*                                                                                                                                    *
*    30 2a 30 05 06 03 2b 65 70 03 21 00           ->     44-12(this)=32 bytes pubkey                                                *
*    30 2e 02 01 00 30 05 06 03 2b 65 70 04 22 04 20  -> 48-16(this)=32 bytes private key entropy                                    * 
*                                                                                                                                    *
**************************************************************************************************************************************

*/








//____________________________________________________________EXECUTION PROCESS____________________________________________________________




sign=await SIG(RSA.publicKey+GUID,KES.prv)

console.log('SIG IS ->',sign)

console.log('VERIFIED ->',await VERIFY(RSA.publicKey+GUID,sign,KES.pub))


fetch(`http://localhost:8888/sd`,{method:'POST',body:JSON.stringify({c:KES.pub,d:[RSA.publicKey,sign,'somechain']})}).then(r=>r.text()).then(val=>{

    console.log('RAW MESSAGE FROM NODE ->',val)

    val!==''&&console.log('RECEIVED -> ',DECRYPT(val,RSA.privateKey))

})