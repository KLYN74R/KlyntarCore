{
   "targets":[
        {
           "target_name": "CRYSTAL",
           "sources": ["crystal.cc"],

            "conditions":[
                ["OS=='linux'", {
                    "libraries": [ "<!(pwd)/crystal.so" ]
                }],
            
                ["OS=='mac'", {
                    "libraries": [ "<!(pwd)/crystal.so" ]
                }],
                ["OS=='win'", {
                    "libraries": [ "<!(pwd)/crystal.dll" ]
                }]
          
            ], 

        }
   
    ]

}