/**
 * Test Publishing Script
 * 
 * Signs a publishing record with test user's identity key
 * and submits it to the API
 */

import { PrivateKey } from '@smartledger/bsv';
import bsv from '@smartledger/bsv';
import axios from 'axios';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config();

const API_URL = process.env.API_URL || 'http://localhost:3000';
const PRIVATE_KEY_WIF = process.env.TEST_USER_IDENTITY_PRIVATE_KEY;
const PUBLIC_KEY_HEX = process.env.TEST_USER_IDENTITY_PUBLIC_KEY;

if (!PRIVATE_KEY_WIF || !PUBLIC_KEY_HEX) {
  console.error('❌ TEST_USER_IDENTITY_PRIVATE_KEY and TEST_USER_IDENTITY_PUBLIC_KEY must be set in .env');
  process.exit(1);
}

/**
 * Canonicalize JSON (RFC 8785)
 */
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

/**
 * Hash JSON object
 */
function hashJSON(obj: any): string {
  const canonical = canonicalizeJSON(obj);
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Main function
 */
async function testPublish() {
  console.log('\n📝 RareGen Publishing Test');
  console.log('='.repeat(70));
  console.log(`API URL: ${API_URL}`);
  console.log(`Signer Public Key: ${PUBLIC_KEY_HEX}`);

  try {
    // Load private key
    const privKey = PrivateKey.fromWIF(PRIVATE_KEY_WIF);

    // Create publishing record
    const record = {
      type: 'music',
      assetId: `ASSET-${Date.now()}`,
      recordId: `REC-${Date.now()}`,
      event: 'REGISTER',
      timestamp: new Date().toISOString(),
      owners: [
        {
          partyId: 'codenlighten',
          role: 'publisher',
          shareBps: 10000  // 100% in basis points (1 bp = 0.01%)
        }
      ],
      distribution: {
        cdnUrl: 'https://example.com/asset',
        sha256: 'abc123def456',
        contentType: 'audio/mpeg'
      },
      terms: {
        territory: 'US',
        rights: ['streaming', 'download'],
        mechanical: false
      },
      nonce: Date.now().toString()
    };

    console.log(`\n📋 Publishing Record:`);
    console.log(`   Record ID: ${record.recordId}`);
    console.log(`   Type: ${record.type}`);
    console.log(`   Event: ${record.event}`);
    console.log(`   Territory: ${record.terms.territory}`);

    // Hash and sign
    const recordHash = hashJSON(record);
    const hashBuffer = Buffer.from(recordHash, 'hex');
    const sig = bsv.crypto.ECDSA.sign(hashBuffer, privKey);
    const sigBuffer = sig.toBuffer();
    const sigBase64 = sigBuffer.toString('base64');

    console.log(`\n🔐 Signature:`);
    console.log(`   Hash: ${recordHash}`);
    console.log(`   Sig (Base64): ${sigBase64.substring(0, 40)}...`);

    // Create API payload
    const payload = {
      protocol: 'sl-drm',
      version: 1,
      record,
      signer: {
        pubkey: PUBLIC_KEY_HEX
      },
      signature: {
        alg: 'ecdsa',
        hash: recordHash,
        sig: sigBase64
      }
    };

    // Submit to API
    console.log(`\n📤 Submitting to API...`);
    const response = await axios.post(`${API_URL}/v1/publish`, payload, {
      headers: {
        'Content-Type': 'application/json'
      },
      validateStatus: () => true // Accept all status codes
    });

    console.log(`\n📊 Response Status: ${response.status}`);
    console.log(`Response Data:`, JSON.stringify(response.data, null, 2));

    if (response.status === 202 || response.status === 200) {
      console.log(`\n✅ Success!`);
      if (response.data.jobId) {
        console.log(`   Job ID: ${response.data.jobId}`);
        console.log(`   Monitor status: GET /v1/job/${response.data.jobId}`);
      }
    } else {
      console.log(`\n❌ Error: ${response.data.error || 'Unknown error'}`);
    }

  } catch (error: any) {
    console.error(`\n❌ Error:`, error.message);
    if (error.response) {
      console.error(`Response:`, error.response.data);
    }
    process.exit(1);
  }
}

testPublish();
