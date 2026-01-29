const bsv = require('@smartledger/bsv');

// Generate a new private key
const privateKey = bsv.PrivateKey.fromRandom();

// Get the public key
const publicKey = privateKey.toPublicKey();

// Get the address
const address = privateKey.toAddress();

// Get WIF (Wallet Import Format) for the private key
const wif = privateKey.toWIF();

console.log('Generated BSV Keys:');
console.log('==================');
console.log('');
console.log('# BSV Configuration');
console.log(`BSV_PRIVATE_KEY=${wif}`);
console.log(`BSV_PUBLIC_KEY=${publicKey.toString()}`);
console.log(`BSV_ADDRESS=${address.toString()}`);
console.log('');
console.log('Copy the above lines to your .env file');
