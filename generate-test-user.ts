/**
 * Generate 3 keypairs for test user:
 * 1. Identity - for signing publishing intents
 * 2. Financial - for earnings and payments
 * 3. Tokens - for subscription credits and token accounting
 */

import { PrivateKey } from '@smartledger/bsv';
import * as crypto from 'crypto';
import bsv from '@smartledger/bsv';

const EMAIL = 'codenlighten1@gmail.com';

// Generate 3 keypairs
const identityPrivKey = PrivateKey.fromRandom();
const financialPrivKey = PrivateKey.fromRandom();
const tokensPrivKey = PrivateKey.fromRandom();

interface KeypairSet {
  name: string;
  description: string;
  privateKey: InstanceType<typeof PrivateKey>;
}

const keypairs: KeypairSet[] = [
  {
    name: 'identity',
    description: 'For signing publishing intents and transactions',
    privateKey: identityPrivKey
  },
  {
    name: 'financial',
    description: 'For earnings, payments, and financial transactions',
    privateKey: financialPrivKey
  },
  {
    name: 'tokens',
    description: 'For subscription credits and token accounting',
    privateKey: tokensPrivKey
  }
];

console.log('\n🔐 Generated 3 BSV Keypairs for Test User');
console.log('='.repeat(80));
console.log(`\nEmail: ${EMAIL}`);
console.log(`Date: ${new Date().toISOString()}\n`);

const keyfileContent: Record<string, any> = {
  email: EMAIL,
  created: new Date().toISOString(),
  keypairs: {}
};

keypairs.forEach(({ name, description, privateKey }) => {
  const privKeyWIF = privateKey.toWIF();
  const pubKey = privateKey.publicKey;
  const pubKeyHex = pubKey.toString('hex');
  const address = pubKey.toAddress('mainnet').toString();

  console.log(`\n🔑 ${name.toUpperCase()}`);
  console.log(`   ${description}`);
  console.log(`   ─`.repeat(40));
  console.log(`   Private Key (WIF): ${privKeyWIF}`);
  console.log(`   Public Key (Hex):  ${pubKeyHex}`);
  console.log(`   Address:           ${address}`);

  keyfileContent.keypairs[name] = {
    description,
    privateKey: privKeyWIF,
    publicKey: pubKeyHex,
    address
  };
});

// Test data - sign a sample record with identity key
const testRecord = {
  recordId: 'TEST-USER-001',
  rightsType: 'streaming',
  owners: [
    {
      entityName: 'Codenlighten',
      share: 100
    }
  ],
  territories: ['US', 'CA', 'GB'],
  terms: {
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    restrictions: 'Non-exclusive'
  },
  nonce: Date.now().toString(),
  timestamp: Date.now()
};

// Canonicalize and hash the record
function canonicalizeJSON(obj: any): string {
  return JSON.stringify(sortKeys(obj));
}

function sortKeys(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (typeof obj === 'object') {
    const sorted: any = {};
    Object.keys(obj).sort().forEach(key => {
      sorted[key] = sortKeys(obj[key]);
    });
    return sorted;
  }
  return obj;
}

function hashJSON(obj: any): string {
  const canonical = canonicalizeJSON(obj);
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

// Sign the record with IDENTITY key
const recordHash = hashJSON(testRecord);
const hashBuffer = Buffer.from(recordHash, 'hex');

// Sign using BSV ECDSA crypto module
const sig = bsv.crypto.ECDSA.sign(hashBuffer, identityPrivKey);
const sigBuffer = sig.toBuffer();
const sigBase64 = sigBuffer.toString('base64');

const identityPubKey = identityPrivKey.publicKey;
const identityPubKeyHex = identityPubKey.toString('hex');
const identityAddress = identityPubKey.toAddress('mainnet').toString();

console.log('\n\n✅ Test Signing (Using Identity Key)');
console.log('='.repeat(80));
console.log(`\nRecord: ${JSON.stringify(testRecord, null, 2)}`);
console.log(`\nRecord Hash: ${recordHash}`);
console.log(`Signature (Base64): ${sigBase64}`);
console.log(`Signature (Hex): ${sigBuffer.toString('hex')}`);

// Prepare API request
const apiPayload = {
  protocol: 'sl-drm',
  version: 1,
  record: testRecord,
  signer: {
    pubkey: identityPubKeyHex,
    address: identityAddress
  },
  signature: {
    alg: 'ecdsa',
    hash: recordHash,
    sig: sigBase64
  }
};

console.log('\n\n📋 API Request Payload:');
console.log('='.repeat(80));
console.log(JSON.stringify(apiPayload, null, 2));

console.log('\n\n💾 Add these to .env file:');
console.log('='.repeat(80));
console.log(`
# Test User Account
TEST_USER_EMAIL=codenlighten1@gmail.com

# Identity Key (for signing publishing intents)
TEST_USER_IDENTITY_PRIVATE_KEY=${identityPrivKey.toWIF()}
TEST_USER_IDENTITY_PUBLIC_KEY=${identityPubKeyHex}
TEST_USER_IDENTITY_ADDRESS=${identityAddress}

# Financial Key (for earnings and payments)
TEST_USER_FINANCIAL_PRIVATE_KEY=${financialPrivKey.toWIF()}
TEST_USER_FINANCIAL_PUBLIC_KEY=${financialPrivKey.publicKey.toString('hex')}
TEST_USER_FINANCIAL_ADDRESS=${financialPrivKey.publicKey.toAddress('mainnet').toString()}

# Tokens Key (for subscription credits and token accounting)
TEST_USER_TOKENS_PRIVATE_KEY=${tokensPrivKey.toWIF()}
TEST_USER_TOKENS_PUBLIC_KEY=${tokensPrivKey.publicKey.toString('hex')}
TEST_USER_TOKENS_ADDRESS=${tokensPrivKey.publicKey.toAddress('mainnet').toString()}
`);

console.log('\n✅ Keypair generation complete!');
console.log('✅ Copy the above to .env and run: npm run test:publish\n');

