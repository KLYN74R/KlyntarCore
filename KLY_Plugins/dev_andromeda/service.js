export default class {
    constructor(desc, toolchain, type, keywords, payload) {
        ;(this.desc = desc), //Describe your service in a few words.Minimum network size is 200 symbols
            (this.toolchain = toolchain), //['docker','node.js'] - define toolchain and everything what your service are required
            (this.type = type), //'self/git',
            (this.keywords = keywords), //array of keywords for better recognition
            (this.payload = payload) //hex of service or link to repository/arhive to load service
    }
}
