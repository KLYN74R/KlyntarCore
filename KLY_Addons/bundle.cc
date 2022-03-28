/*




      ,',            ,,,,,;;;;;;;;;;;;;;;;;;;;;,,,,,             ,',
     ;  ',        ,;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;,         ,  ',
     ;    ;     ,;;;;;; ;;; ;;  ;;;;;;;;;  ;;  ;;; ;;;;,       ;    ;
     ;     `, ,;;;;;;    ;    ;  ;;;;;;;  ;     ;    ;;;;,   ,'     ;
     ,       ',;;  ;           ;   ;;;   ;             ;  ;,'       ,
      ',       ; ,,,,,,,,,,     ;   ;   ;       ,,,,,,,,,,'.       ,
         ,    ,'          ',    ;       ;    ,''           ',    ,'
         ;;.,'                   ;     ;    '                '..'
        ;;;;                '    ;     ;   '                  ;;
       ;;;;  ;               ',  ;  ;  ;  '                ;  ;;;
 :,    ;;;;   ;;               ',;  ;  ;,'               ;;   ;;;
 ,`,   ;;;;     ;;;               ; ; ;                ;;;    ;;;;    ';
:  `,  ,;;;      ;;;;;;;;;;;;;;;,,  ;   ,,;;;;;;;;;;;;;;;     ;;;,  .' ;
;  ; `,;;;;                                                   ;;;; .'   ;
:  ;`, : ;;,,,,     ;""/\"";.                .;""/\"";,  ,'''';; ;' ,'; ;
:  ;  `; ;;    ',,'  \ \/ /  ',  ;     ;   ,'  \ \/ /  ',     ;; ;,'  ; ;
:  `,  ; ;;      '.,,;,,,;,.'    ;     ;    '.,,;,,,;,.'      ;; ;   ,  ;
`,  ; @; ;;                ,'    ;     ;    ',                ;; ;@ ;   ,
  `,'. ; ;               ,'      ;     ;      ',               ; ;  ; ,' 
   `, ',          ,''''''       ;       ;       '''''',          ;,' ;
     `, :       ,'             ;         ;             '',       ;  ;
      '',    ,''              ;     ;     ;               ',     ;''
        ',  '                (,     ;      )                ',  ,'
         ',                    '''''''''''''                   ,'
           '.             ;;;;;;;;;;;;;;;;;;;;;;              ,
             ,          ,;;;;;;;;;;;;;;;;;;;;;;;;,          ,'
              ,        ;;;;;;;;;;;;;;;;;;;;;;;;;;;;        ,
               ,      ;;;;/\/ |  |\/  \/|  | \/\;;;;      ,
               ',     ;;;/     \/        \/     \;;;    ,'
                ',    ;;;\  /\              /\  /;;;   ,'
                  ',  ;;;;\|  |/\ /\  /\ /\|  |/;;;; ,',
                 ,' ',;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;'   ',
               ,'     ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;      ',
             ,'        ;;;;;;;;;;;;;;;;;;;;;;;;;;;;         ',
   ,',',',','           ;;;;;;;;;;;;;;;;;;;;;;;;;;            ',',',',','
                         ;;;;;;;;;;;;;;;;;;;;;;;;
                         ;;;;;;;;;;;;;;;;;;;;;;;;
                          ;;;;;;;;;;;;;;;;;;;;;;;
                           ;;;;;;         ;;;;;;
                           ;;;;;           ;;;;;
                            ;;;             ;;;
                             ;;             ;;  
                             
                             
Art by: Timothy O'Connor => https://www.asciiart.eu/mythology/devils


Developed by @Vlad@ Chernenko

@KLYNTAR



*/



//__________________________________________________INCLUDE HEADERS_________________________________________________________

#include <node.h>

//Signatures
#include "dilithium.h"
#include "bliss.h"

//Key exchange
#include "kyber.h"
#include "csidh.h"
#include "sike.h"
#include "sidh.h"

//Hash functions
#include "sha256.h"

//Secret share functions
//#include "sss.h"



using namespace std;
using namespace v8;


//___________________________________________________CONSTANTS POOL_______________________________________________________

SHA256 sha256;

const char* ToCString(const String::Utf8Value& value){

    return *value ? *value:"Can't convert";

}







/*


███████ ██   ██ ██████   ██████  ██████  ████████ 
██       ██ ██  ██   ██ ██    ██ ██   ██    ██    
█████     ███   ██████  ██    ██ ██████     ██    
██       ██ ██  ██      ██    ██ ██   ██    ██    
███████ ██   ██ ██       ██████  ██   ██    ██    
                                                  


*/


//___________________________________________________INITIALIZATION_________________________________________________________


/*



███████ ██  ██████  ███    ██  █████  ████████ ██    ██ ██████  ███████ ███████ 
██      ██ ██       ████   ██ ██   ██    ██    ██    ██ ██   ██ ██      ██      
███████ ██ ██   ███ ██ ██  ██ ███████    ██    ██    ██ ██████  █████   ███████ 
     ██ ██ ██    ██ ██  ██ ██ ██   ██    ██    ██    ██ ██   ██ ██           ██ 
███████ ██  ██████  ██   ████ ██   ██    ██     ██████  ██   ██ ███████ ███████ 
                                                                                
                                                                  
*/

//_____________________________________________________DILITHIUM_______________________________________________________

void gen_DIL(const FunctionCallbackInfo<Value>& args){

    Isolate* isolate = args.GetIsolate();
    
    char* result = genDIL();
  
    args.GetReturnValue().Set(String::NewFromUtf8(isolate,result,NewStringType::kNormal).ToLocalChecked());
  
}

void sign_DIL(const FunctionCallbackInfo<Value>& args){

    Isolate* isolate = args.GetIsolate();
    
    String::Utf8Value priv(isolate,args[0]);

    String::Utf8Value msg(isolate,args[1]);
    
    char * privateKey = const_cast<char *>(ToCString(priv));

    char * message = const_cast<char *>(ToCString(msg));



    char* result = signDIL(message,privateKey);
    
    args.GetReturnValue().Set(String::NewFromUtf8(isolate,result,NewStringType::kNormal).ToLocalChecked());

}




void verify_DIL(const FunctionCallbackInfo<Value>& args){

    Isolate* isolate = args.GetIsolate();
    
    String::Utf8Value msg(isolate,args[0]);

    String::Utf8Value pubKey(isolate,args[1]);

    String::Utf8Value signa(isolate,args[2]);


    
    char * message = const_cast<char *>(ToCString(msg));

    char * publicKey = const_cast<char *>(ToCString(pubKey));

    char * signature = const_cast<char *>(ToCString(signa));




    char* result = verifyDIL(message,publicKey,signature);
    
    args.GetReturnValue().Set(String::NewFromUtf8(isolate,result,NewStringType::kNormal).ToLocalChecked());
}


//_____________________________________________________BLISS_______________________________________________________


void gen_BLISS(const FunctionCallbackInfo<Value>& args){

    Isolate* isolate = args.GetIsolate();
    
    char* result = genBLISS();
  
    args.GetReturnValue().Set(String::NewFromUtf8(isolate,result,NewStringType::kNormal).ToLocalChecked());
  
}

void sign_BLISS(const FunctionCallbackInfo<Value>& args){

    Isolate* isolate = args.GetIsolate();
    
    String::Utf8Value priv(isolate,args[0]);

    String::Utf8Value msg(isolate,args[1]);
    
    char * privateKey = const_cast<char *>(ToCString(priv));

    char * message = const_cast<char *>(ToCString(msg));



    char* result = signBLISS(message,privateKey);
    
    args.GetReturnValue().Set(String::NewFromUtf8(isolate,result,NewStringType::kNormal).ToLocalChecked());

}


void verify_BLISS(const FunctionCallbackInfo<Value>& args){

    Isolate* isolate = args.GetIsolate();
    
    String::Utf8Value msg(isolate,args[0]);

    String::Utf8Value pubKey(isolate,args[1]);

    String::Utf8Value signa(isolate,args[2]);


    
    char * message = const_cast<char *>(ToCString(msg));

    char * publicKey = const_cast<char *>(ToCString(pubKey));

    char * signature = const_cast<char *>(ToCString(signa));




    char* result = verifyBLISS(message,publicKey,signature);
    
    args.GetReturnValue().Set(String::NewFromUtf8(isolate,result,NewStringType::kNormal).ToLocalChecked());
}





/*

██   ██  █████  ███████ ██   ██ ███████ ███████ 
██   ██ ██   ██ ██      ██   ██ ██      ██      
███████ ███████ ███████ ███████ █████   ███████ 
██   ██ ██   ██      ██ ██   ██ ██           ██ 
██   ██ ██   ██ ███████ ██   ██ ███████ ███████

*/


void SHA256(const FunctionCallbackInfo<Value>& a){

   Isolate* isolate=a.GetIsolate();

   String::Utf8Value s(isolate,a[0]);
   
   string c(*s);

   a.GetReturnValue().Set(String::NewFromUtf8(isolate,sha256(c).c_str(),NewStringType::kNormal).ToLocalChecked());
}




/*
██   ██ ███████ ██    ██     ███████ ██   ██  ██████ ██   ██  █████  ███    ██  ██████  ███████ 
██  ██  ██       ██  ██      ██       ██ ██  ██      ██   ██ ██   ██ ████   ██ ██       ██      
█████   █████     ████       █████     ███   ██      ███████ ███████ ██ ██  ██ ██   ███ █████   
██  ██  ██         ██        ██       ██ ██  ██      ██   ██ ██   ██ ██  ██ ██ ██    ██ ██      
██   ██ ███████    ██        ███████ ██   ██  ██████ ██   ██ ██   ██ ██   ████  ██████  ███████ 
*/


//_______________________________________________________KYBER_______________________________________________________

void gen_KYBER(const FunctionCallbackInfo<Value>& args){

    Isolate* isolate = args.GetIsolate();

    //Scheme
    String::Utf8Value sch(isolate,args[0]);

    //Role
    String::Utf8Value rol(isolate,args[1]);

    char * scheme = const_cast<char *>(ToCString(sch));

    char * role = const_cast<char *>(ToCString(rol));


    char* result = genKYBER(scheme,role);

    args.GetReturnValue().Set(String::NewFromUtf8(isolate,result,NewStringType::kNormal).ToLocalChecked());

}



void get_KYBER_SharedSender(const FunctionCallbackInfo<Value>& args){

  Isolate* isolate = args.GetIsolate();

  //Scheme(Kyber-512 by default)
  String::Utf8Value scheme(isolate,args[0]);

  //Seed as hex
  String::Utf8Value hexSeed(isolate,args[1]);

  //Ciphertext as hex
  String::Utf8Value hexCipherText(isolate,args[2]);


  char * Cscheme = const_cast<char *>(ToCString(scheme));

  char * ChexSeed = const_cast<char *>(ToCString(hexSeed));

  char * ChexCipherText = const_cast<char *>(ToCString(hexCipherText));



  char* result = getSharedKYBERAsSender(Cscheme,ChexSeed,ChexCipherText);

  args.GetReturnValue().Set(String::NewFromUtf8(isolate,result,NewStringType::kNormal).ToLocalChecked());

}



void get_KYBER_SharedRecepient(const FunctionCallbackInfo<Value>& args){

  Isolate* isolate = args.GetIsolate();

   //Scheme(Kyber-512 by default)
   String::Utf8Value scheme(isolate,args[0]);

   //Seed as hex
   String::Utf8Value hexSeed(isolate,args[1]);

   //Ciphertext as hex
   String::Utf8Value hexSenderPub(isolate,args[2]);


   char * Cscheme = const_cast<char *>(ToCString(scheme));

   char * ChexSeed = const_cast<char *>(ToCString(hexSeed));

   char * ChexSenderPub = const_cast<char *>(ToCString(hexSenderPub));



   char* result = getSharedKYBERAsRecepient(Cscheme,ChexSeed,ChexSenderPub);

   args.GetReturnValue().Set(String::NewFromUtf8(isolate,result,NewStringType::kNormal).ToLocalChecked());

}



//_______________________________________________________CSIDH_______________________________________________________


void gen_CSIDH(const FunctionCallbackInfo<Value>& args){

    Isolate* isolate = args.GetIsolate();

    char* result = genCSIDH();

    args.GetReturnValue().Set(String::NewFromUtf8(isolate,result,NewStringType::kNormal).ToLocalChecked());

}

void get_CSIDH(const FunctionCallbackInfo<Value>& args){

    Isolate* isolate = args.GetIsolate();

    String::Utf8Value friendPub(isolate,args[0]);

    String::Utf8Value myPriv(isolate,args[1]);

    char * friendPublic = const_cast<char *>(ToCString(friendPub));

    char * myPrivate = const_cast<char *>(ToCString(myPriv));



    char* result = getCSIDH(friendPublic,myPrivate);

    args.GetReturnValue().Set(String::NewFromUtf8(isolate,result,NewStringType::kNormal).ToLocalChecked());

}


//_______________________________________________________SIKE_______________________________________________________


void gen_SIKE(const FunctionCallbackInfo<Value>& args){

    Isolate* isolate = args.GetIsolate();
    
    char* result = genSIKE();
  
    args.GetReturnValue().Set(String::NewFromUtf8(isolate,result,NewStringType::kNormal).ToLocalChecked());
  
}



void enc_SIKE(const FunctionCallbackInfo<Value>& args){

    Isolate* isolate = args.GetIsolate();
    
    String::Utf8Value friendPubHex(isolate,args[0]);

    String::Utf8Value myPrivHex(isolate,args[1]);


    
    char * friendPub = const_cast<char *>(ToCString(friendPubHex));

    char * myPriv = const_cast<char *>(ToCString(myPrivHex));



    char* result = encSIKE(friendPub,myPriv);
    
    args.GetReturnValue().Set(String::NewFromUtf8(isolate,result,NewStringType::kNormal).ToLocalChecked());

}

void dec_SIKE(const FunctionCallbackInfo<Value>& args){

    Isolate* isolate = args.GetIsolate();
    
    String::Utf8Value friendPubHex(isolate,args[0]);

    String::Utf8Value myPrivHex(isolate,args[1]);

    String::Utf8Value cipherHex(isolate,args[1]);

    
    char * friendPub = const_cast<char *>(ToCString(friendPubHex));

    char * myPriv = const_cast<char *>(ToCString(myPrivHex));

    char * cipherText = const_cast<char *>(ToCString(cipherHex));



    char* result = decSIKE(friendPub,myPriv,cipherText);
    
    args.GetReturnValue().Set(String::NewFromUtf8(isolate,result,NewStringType::kNormal).ToLocalChecked());

}


//_______________________________________________________SIDH_______________________________________________________


void gen_SIDH(const FunctionCallbackInfo<Value>& args){

    Isolate* isolate = args.GetIsolate();

    String::Utf8Value keyType(isolate,args[0]);

    char * keyTyp = const_cast<char *>(ToCString(keyType));



    char* result = genSIDH(keyTyp);

    args.GetReturnValue().Set(String::NewFromUtf8(isolate,result,NewStringType::kNormal).ToLocalChecked());

}



void get_SIDH(const FunctionCallbackInfo<Value>& args){

    Isolate* isolate = args.GetIsolate();

    String::Utf8Value myKeyType(isolate,args[0]);

    String::Utf8Value friendPubHex(isolate,args[1]);

    String::Utf8Value myPrivHex(isolate,args[2]);


    char * keyTyp = const_cast<char *>(ToCString(myKeyType));

    char * friendPub = const_cast<char *>(ToCString(friendPubHex));

    char * myPriv = const_cast<char *>(ToCString(myPrivHex));



    char* result = getSIDH(keyTyp,friendPub,myPriv);

    args.GetReturnValue().Set(String::NewFromUtf8(isolate,result,NewStringType::kNormal).ToLocalChecked());

}






/*
██ ███    ██ ██ ████████ 
██ ████   ██ ██    ██    
██ ██ ██  ██ ██    ██    
██ ██  ██ ██ ██    ██    
██ ██   ████ ██    ██
*/

void Initialize(Local<Object> exports){
  

  //Dilithium(2)
  NODE_SET_METHOD(exports,"gen_DIL",gen_DIL);

  NODE_SET_METHOD(exports,"sign_DIL",sign_DIL);
    
  NODE_SET_METHOD(exports,"verify_DIL",verify_DIL);

  //BLISS
  NODE_SET_METHOD(exports,"gen_BLISS",gen_BLISS);

  NODE_SET_METHOD(exports,"sign_BLISS",sign_BLISS);
    
  NODE_SET_METHOD(exports,"verify_BLISS",verify_BLISS);

  //CSIDH
  NODE_SET_METHOD(exports,"gen_CSIDH",gen_CSIDH);
  
  NODE_SET_METHOD(exports,"get_CSIDH",get_CSIDH);

  //KYBER(512)
  NODE_SET_METHOD(exports,"gen_KYBER",gen_KYBER);
  
  NODE_SET_METHOD(exports,"gen_KYBER_SharedSender",get_KYBER_SharedSender);
  
  NODE_SET_METHOD(exports,"gen_KYBER_SharedRecepient",get_KYBER_SharedRecepient);


  //SHA256
  NODE_SET_METHOD(exports,"sha256",SHA256);


  //SIKE
  NODE_SET_METHOD(exports,"gen_SIKE",gen_SIKE);

  NODE_SET_METHOD(exports,"enc_SIKE",enc_SIKE);

  NODE_SET_METHOD(exports,"dec_SIKE",dec_SIKE);


  //SIDH
  NODE_SET_METHOD(exports,"gen_SIDH",gen_SIDH);

  NODE_SET_METHOD(exports,"get_SIDH",get_SIDH);


}




NODE_MODULE(BUNDLE,Initialize);