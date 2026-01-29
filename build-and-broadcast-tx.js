#!/usr/bin/env node

const axios = require('axios');
const bsv = require('@smartledger/bsv');
require('dotenv').config();

const BASE_URL = process.argv[2] || 'http://localhost:3000';
const CHAIN = process.argv[3] || 'bsv';
const NETWORK = process.argv[4] || 'main';

const ADDRESS = process.env.BSV_ADDRESS;
const PRIVATE_KEY = process.env.BSV_PRIVATE_KEY;
const AMOUNT_SATS = 100;
const FEE_SATS = 225; // Estimated fee

async function buildAndBroadcast() {
  try {
    console.log('\n🔨 Building Transaction...\n');
    
    // Fetch UTXOs
    console.log('1️⃣  Fetching UTXOs...');
    const utxosRes = await axios.get(`${BASE_URL}/api/${CHAIN}/${NETWORK}/address/${ADDRESS}/utxos`);
    const utxos = utxosRes.data.data.result;
    
    if (utxos.length === 0) {
      console.error('❌ No UTXOs available');
      process.exit(1);
    }
    
    const utxo = utxos[0];
    console.log(`✅ Found UTXO: ${utxo.tx_hash} (${utxo.value} sats)`);
    
    // Build transaction
    console.log('\n2️⃣  Building transaction...');
    const privateKey = bsv.PrivateKey.fromWIF(PRIVATE_KEY);
    const fromAddress = bsv.Address.fromString(ADDRESS);
    
    const tx = new bsv.Transaction()
      .from({
        txid: utxo.tx_hash,
        outputIndex: utxo.tx_pos,
        script: bsv.Script.fromHex(utxo.scriptPubKey),
        satoshis: utxo.value
      })
      .to(ADDRESS, AMOUNT_SATS)
      .fee(FEE_SATS)
      .sign(privateKey);
    
    const txHex = tx.toString('hex');
    console.log(`✅ Transaction built`);
    console.log(`   TX Size: ${tx.size} bytes`);
    console.log(`   Input: ${utxo.value} sats`);
    console.log(`   Output: ${AMOUNT_SATS} sats`);
    console.log(`   Fee: ${FEE_SATS} sats`);
    console.log(`   Change: ${utxo.value - AMOUNT_SATS - FEE_SATS} sats`);
    
    // Broadcast transaction
    console.log('\n3️⃣  Broadcasting transaction...');
    const broadcastRes = await axios.post(
      `${BASE_URL}/api/${CHAIN}/${NETWORK}/tx/broadcast`,
      { txHex: txHex },
      { headers: { 'Content-Type': 'application/json' } }
    );
    
    console.log(`✅ Transaction broadcast successfully!`);
    console.log(`   TXID: ${broadcastRes.data.data.txid || broadcastRes.data.data}`);
    console.log(`\n📊 Transaction Details:`);
    console.log(`   From: ${ADDRESS}`);
    console.log(`   To: ${ADDRESS}`);
    console.log(`   Amount: ${AMOUNT_SATS} sats`);
    console.log(`   Hex: ${txHex}`);
    
  } catch (error) {
    console.error('\n❌ Error:', error.response?.data || error.message);
    process.exit(1);
  }
}

buildAndBroadcast();
