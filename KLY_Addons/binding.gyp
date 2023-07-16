{
   "targets":[
        {
           "target_name": "BUNDLE",

           "sources": ["bundle.cc","sha256.h","sha256.cc"],

            "conditions":[
                ["OS=='linux'", {

                    "libraries": [

                        "<!(pwd)/dilithium.so",
                        "<!(pwd)/kyber.so",
                        "<!(pwd)/sidh.so",
                        "<!(pwd)/sike.so",
                        "<!(pwd)/csidh.so",
                        "<!(pwd)/bliss.so",
                        "<!(pwd)/kyber_pke.so",

                    ]

                }],

                ["OS=='mac'", {

                    "libraries": [

                        "<!(pwd)/dilithium.so",
                        "<!(pwd)/kyber.so",
                        "<!(pwd)/sidh.so",
                        "<!(pwd)/sike.so",
                        "<!(pwd)/csidh.so",
                        "<!(pwd)/bliss.so",
                        "<!(pwd)/kyber_pke.so",

                    ]

                }],
                ["OS=='win'", {
                    "libraries": [
                        '<!(cd ")/dilithium.dll',
                        '<!(cd ")/kyber.dll',
                        '<!(cd ")/sidh.dll',
                        '<!(cd ")/sike.dll',
                        '<!(cd ")/csidh.dll',
                        '<!(cd ")/bliss.dll',
                        '<!(cd ")/kyber_pke.dll',
                    ]

                }]

            ],

        }

    ]

}