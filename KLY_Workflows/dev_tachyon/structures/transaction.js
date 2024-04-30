export default class {
    constructor(version, creator, txType, nonce, fee, payload) {
        this.v = version

        this.creator = creator

        this.type = txType

        this.nonce = nonce

        this.fee = fee

        this.payload = payload

        //this.sig=signature
    }
}
