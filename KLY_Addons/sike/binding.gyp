{
   "targets":[
        {
           "target_name": "DILITHIUM",
           "sources": ["dilithium.cc"],

            "conditions":[
                ["OS=='linux'", {
                    "libraries": [ "<!(pwd)/dilithium.so" ]
                }],
            
                ["OS=='mac'", {
                    "libraries": [ "<!(pwd)/dilithium.so" ]
                }],
                ["OS=='win'", {
                    "libraries": [ "<!(pwd)/dilithium.dll" ]
                }]
          
            ], 

        }
   
    ]

}