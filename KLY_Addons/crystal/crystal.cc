#include<node.h>
#include"crystal.h"




using namespace std;
using namespace v8;




const char* ToCString(const String::Utf8Value& value){

    return *value ? *value:"Can't convert";

}

//_________________________________________________EXTERNAL FUNCTIONS_______________________________________________________

void genKeys(const FunctionCallbackInfo<Value>& args){

    Isolate* isolate = args.GetIsolate();
    
    char* result = generate();
  
    args.GetReturnValue().Set(String::NewFromUtf8(isolate,result,NewStringType::kNormal).ToLocalChecked());
  
}

void sign(const FunctionCallbackInfo<Value>& args){

    Isolate* isolate = args.GetIsolate();
    
    String::Utf8Value priv(isolate,args[0]);

    String::Utf8Value msg(isolate,args[1]);
    
    char * privateKey = const_cast<char *>(ToCString(priv));

    char * message = const_cast<char *>(ToCString(msg));



    char* result = sign(message,privateKey);
    
    args.GetReturnValue().Set(String::NewFromUtf8(isolate,result,NewStringType::kNormal).ToLocalChecked());

}


void verify(const FunctionCallbackInfo<Value>& args){

    Isolate* isolate = args.GetIsolate();
    
    String::Utf8Value msg(isolate,args[0]);

    String::Utf8Value pubKey(isolate,args[1]);

    String::Utf8Value signa(isolate,args[2]);


    
    char * message = const_cast<char *>(ToCString(msg));

    char * publicKey = const_cast<char *>(ToCString(pubKey));

    char * signature = const_cast<char *>(ToCString(signa));




    char* result = verify(message,publicKey,signature);
    
    args.GetReturnValue().Set(String::NewFromUtf8(isolate,result,NewStringType::kNormal).ToLocalChecked());
}



//___________________________________________________INITIALIZATION_________________________________________________________


void Initialize(Local<Object> exports){
  
  NODE_SET_METHOD(exports,"genKeys",genKeys);

  NODE_SET_METHOD(exports,"sign",sign);

  NODE_SET_METHOD(exports,"verify",verify);

}

NODE_MODULE(CRYSTAL,Initialize);