import { hash } from 'blake3-wasm'

let BLAKE3 = v => hash(v).toString('hex'),
    getRandomArbitrary = (min, max) => Math.random() * (max - min) + min

export default {
    WINTERITZ: {
        generate: () => {
            let privateKey = []

            for (let i = 0; i < 32; i++) privateKey.push(getRandomArbitrary(0, 2 ** 32))

            let publicKey = privateKey.map(x => {
                let init = x + ''

                for (let i = 0; i < 256; i++) init = BLAKE3(init)

                return init
            })

            return { privateKey, publicKey }
        },

        sig: (data, privateKey) => {
            let bytes = new Uint8Array(hash(data))

            bytes.forEach((byte, index) => {
                privateKey[index] += ''

                for (let i = 0; i < byte; i++) privateKey[index] = BLAKE3(privateKey[index])
            })

            return privateKey //it's signature because we hashed value BYTE times
        },

        verify: (publicKey, data, signature) => {
            let bytes = new Uint8Array(hash(data))

            bytes.forEach((byte, index) => {
                let rest = 256 - byte

                signature[index] += ''

                for (let i = 0; i < rest; i++) signature[index] = BLAKE3(signature[index])
            })

            return publicKey.every((pub, index) => pub === signature[index])
        }
    },

    HORS: {
        generate: () => {
            let privateKey = []

            for (let i = 0; i < 32; i++) privateKey.push(getRandomArbitrary(0, 2 ** 32))

            let publicKey = privateKey.map(x => {
                let init = x + ''

                for (let i = 0; i < 256; i++) init = BLAKE3(init)

                return init
            })

            return { privateKey, publicKey }
        },

        sig: (data, privateKey) => {
            let bytes = new Uint8Array(hash(data))

            bytes.forEach((byte, index) => {
                privateKey[index] += ''

                for (let i = 0; i < byte; i++) privateKey[index] = BLAKE3(privateKey[index])
            })

            return privateKey //it's signature because we hashed value BYTE times
        },

        verify: (publicKey, data, signature) => {
            let bytes = new Uint8Array(hash(data))

            bytes.forEach((byte, index) => {
                let rest = 256 - byte

                signature[index] += ''

                for (let i = 0; i < rest; i++) signature[index] = BLAKE3(signature[index])
            })

            return publicKey.every((pub, index) => pub === signature[index])
        }
    },

    BIBA: {}
}
