from pynewhope import newhope

# Step 1: Alice generates random keys and her public msg to Bob
alicePrivKey, aliceMsg = newhope.keygen()
print("Alice sends to Bob her public message:", aliceMsg)

# Step 2: Bob receives the msg from Alice and responds to Alice with a msg
bobSharedKey, bobMsg = newhope.sharedB(aliceMsg)
print("\nBob's sends to Alice his public message:", bobMsg)
print("\nBob's shared key:", bobSharedKey)

# Step 3: Alice receives the msg from Bob and generates her shared secret
aliceSharedKey = newhope.sharedA(bobMsg, alicePrivKey)
print("\nAlice's shared key:", aliceSharedKey)

if aliceSharedKey == bobSharedKey:
    print("\nSuccessful key exchange! Keys match.")
else:
    print("\nError! Keys do not match.")