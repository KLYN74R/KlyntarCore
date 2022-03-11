#include<node.h>
#include<string.h>
#include"sha256.h"



using namespace std;
using namespace v8;

//____________________________________________POOL OF VARIABLES&FUNCTIONS__________________________________________________

SHA256 sha256;

//_________________________________________________EXTERNAL FUNCTIONS_______________________________________________________

void SHA256(const FunctionCallbackInfo<Value>& a){

   Isolate* isolate=a.GetIsolate();

   String::Utf8Value s(isolate,a[0]);
   
   string c(*s);

   a.GetReturnValue().Set(String::NewFromUtf8(isolate,sha256(c).c_str(),NewStringType::kNormal).ToLocalChecked());
}

//___________________________________________________INITIALIZATION_________________________________________________________

void Initialize(Local<Object> exports){ NODE_SET_METHOD(exports,"SHA256",SHA256); }

NODE_MODULE(CPP_UTILS,Initialize);