{
   "targets":[
        {
           "target_name": "BUNDLE",

           "sources": ["bundle.cc","sha256.h"],

            "conditions":[
                ["OS=='linux'", {
                    
                    "libraries": [ 
                        
                        "<!(pwd)/dilithium.so",
                        "<!(pwd)/kyber.so",
                        "<!(pwd)/sidh.so",
                        "<!(pwd)/sike.so",
                        "<!(pwd)/csidh.so",
                        "<!(pwd)/bliss.so"
                        
                    ]

                }],
            
                ["OS=='mac'", {
                     
                    "libraries": [ 
                        
                        "<!(pwd)/dilithium.so",
                        "<!(pwd)/kyber.so",
                        "<!(pwd)/sidh.so",
                        "<!(pwd)/sike.so",
                        "<!(pwd)/csidh.so",
                        "<!(pwd)/bliss.so"
                        
                    ]

                }],
                ["OS=='win'", {
                    "libraries": [
                        '<!(pwd)/dilithium.dll',
                        '<!(pwd)/kyber.dll',
                        '<!(pwd)/sidh.dll',
                        '<!(pwd)/sike.dll',
                        '<!(pwd)/csidh.dll',
                        '<!(pwd)/bliss.dll',
                    ]

                }]
          
            ], 

        }
   
    ]

}