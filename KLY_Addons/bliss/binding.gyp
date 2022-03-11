{
   "targets":[
        {
           "target_name": "BLISS",
           "sources": ["bliss.cc"],

            "conditions":[
                ["OS=='linux'", {
                    "libraries": [ "<!(pwd)/bliss.so" ]
                }],
            
                ["OS=='mac'", {
                    "libraries": [ "<!(pwd)/bliss.so" ]
                }],
                ["OS=='win'", {
                    "libraries": [ "<!(pwd)/bliss.dll" ]
                }]
          
            ], 

        }
   
    ]

}