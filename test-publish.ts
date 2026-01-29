/**
 * Test client for publishing a transaction to RareGen API
 * 
 * Users have a private key (WIF) and sign the record JSON
 * They send: signature (base64), publickey, and the record data
 */

import { PrivateKey } from '@smartledger/bsv';
import axios from 'axios';
import * as crypto from 'crypto';

// Test private key from .env
const PRIVATE_KEY_WIF = 'KxDJu5WbLVYW2UtuvJiefQKh6NwrsKJyvutai5optP8MkukaZEEi';
const API_URL = process.env.API_URL || 'https://api.raregeneration.me';

/**
 * RFC 8785 JCS Canonicalization - deterministic JSON
 */
function canonicalizeJSON(obj: any): string {
  if (obj === null) return 'null';
  if (typeof obj === 'boolean') return obj ? 'true' : 'false';
  if (typeof obj === 'number') return String(obj);
  if (typeof obj === 'string') return JSON.stringify(obj);
  
  if (Array.isArray(obj)) {
    const items = obj.map(item => canonicalizeJSON(item));
    return `[${items.join(',')}]`;
  }
  
  if (typeof obj === 'object') {
    const keys = Object.keys(obj).sort();
    const pairs = keys.map(key => 
      `${JSON.stringify(key)}:${canonicalizeJSON(obj[key])}`
    );
    return `{${pairs.join(',')}}`;
  }
  
  return String(obj);
}

/**
 * Create SHA256 hash of content
 */
function sha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Hash a JSON object using JCS
 */
function hashJSON(obj: any): string {
  const canonical = canonicalizeJSON(obj);
  return sha256(canonical);
}

/**
 * Main test function
 */
async function testPublish() {
  console.log('\n📝 RareGen Publishing Test Client');
  console.log('='.repeat(50));
  
  try {
    // Initialize keys from WIF
    const privKey = PrivateKey.fromWIF(PRIVATE_KEY_WIF);
    const pubKey = privKey.publicKey;
    const pubKeyStr = pubKey.toString();
    
    console.log(`\n🔑 Using private key (WIF): ${PRIVATE_KEY_WIF.substring(0, 10)}...`);
    console.log(`🔑 Using public key: ${pubKeyStr}`);
    console.log(`📍 API URL: ${API_URL}`);
    
    // Create test publishing record
    const recordId = `TEST-${Date.now()}`;
    const nonce = Date.now().toString();
    
    const record = {
      recordId,
      rightsType: 'streaming',
      owners: [
        {
          entityName: 'Test Publisher',
          share: 100
        }
      ],
      territories: ['US', 'CA'],
      terms: {
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        restrictions: 'Testing only'
      }
    };
    
    console.log(`\n📋 Publishing Record:`);
    console.log(`  Record ID: ${recordId}`);
    console.log(`  Nonce: ${nonce}`);
    console.log(`  Signer: ${pubKeyStr}`);
    
    // Hash the record
    const recordHash = hashJSON(record);
    console.log(`\n📊 Record Hash: ${recordHash}`);
    
    // Sign the hash with private key
    console.log(`\n🔐 Signing record...`);
    const hashBuffer = Buffer.from(recordHash, 'hex');
    
    // Use BSV to sign the hash
    const sig = privKey.sign(hashBuffer);
    const sigDER = sig.toDER();
    const signature = sigDER.toString('base64');
    
    console.log(`  Signature (base64): ${signature.substring(0, 30)}...`);
    console.log(`  Signature length: ${signature.length} chars`);
    
    // Prepare request payload
    // The record must be included so the server can hash it and verify
    const payload = {
      publickey: pubKeyStr,
      signature: signature,
      nonce: nonce,
      record: record
    };
    
    // Submit to API
    console.log(`\n📤 Submitting to ${API_URL}/v1/publish...`);
    const response = await axios.post(`${API_URL}/v1/publish`, payload, {
      headers: {
        'Content-Type': 'application/json'
      },
      validateStatus: () => true // Don't throw on any status
    });
    
    console.log(`\n📊 Response Status: ${response.status}`);
    
    if (response.status === 202) {
      console.log(`✅ Success! Job accepted`);
      console.log(`📊 Response:`, JSON.stringify(response.data, null, 2));
      
      const jobId = response.data.jobId;
      
      // Poll job status
      console.log(`\n⏳ Checking job status (jobId: ${jobId})...`);
      
      let attempts = 0;
      const maxAttempts = 30;
      
      while (attempts < maxAttempts) {
        try {
          const statusResponse = await axios.get(`${API_URL}/v1/job/${jobId}`, {
            validateStatus: () => true
          });
          
          if (statusResponse.status === 200) {
            const job = statusResponse.data;
            console.log(`  Attempt ${attempts + 1}: Status = ${job.status}`);
            
            if (job.status === 'published' || job.status === 'confirmed') {
              console.log(`\n✅ Job completed!`);
              console.log(`   TXID: ${job.txid}`);
              console.log(`   View on blockchain: https://explorer.codenlighten.org/tx/${job.txid}`);
              break;
            }
            
            if (job.status === 'failed' || job.status === 'error') {
              console.log(`\n❌ Job failed: ${job.error}`);
              break;
            }
          }
          
          await new Promise(resolve => setTimeout(resolve, 2000));
          attempts++;
          
        } catch (err: any) {
          console.log(`  Attempt ${attempts + 1}: waiting...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          attempts++;
        }
      }
      
      console.log(`\n${'='.repeat(50)}`);
      console.log(`✅ Test completed successfully!`);
      console.log(`   Job ID: ${jobId}`);
      console.log(`   Record Hash: ${recordHash}`);
      
    } else {
      console.log(`❌ Request failed with status ${response.status}`);
      console.log(`📊 Response:`, JSON.stringify(response.data, null, 2));
      process.exit(1);
    }
    
  } catch (error: any) {
    console.error(`\n❌ Error:`, error.message);
    if (error.response?.data) {
      console.error(`📊 Response:`, JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

// Run test
testPublish();
