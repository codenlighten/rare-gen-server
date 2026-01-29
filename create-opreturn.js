#!/usr/bin/env node

const axios = require('axios');
const bsv = require('@smartledger/bsv');
require('dotenv').config();

const BASE_URL = process.argv[2] || 'https://explorer.codenlighten.org';
const CHAIN = process.argv[3] || 'bsv';
const NETWORK = process.argv[4] || 'main';

const ADDRESS = process.env.BSV_ADDRESS;
const PRIVATE_KEY = process.env.BSV_PRIVATE_KEY;
const FEE_RATE_PER_KB = Number(process.argv[8] || process.env.FEE_RATE_PER_KB || 1); // satsPerKb fee rate
const OP_RETURN_HEX = (process.argv[5] || process.env.OP_RETURN_HEX || '').trim();
const UTXO_TXID = (process.argv[6] || '').trim();
const UTXO_VOUT = process.argv[7] !== undefined ? Number(process.argv[7]) : null;

function getOpReturnBuffer() {
  if (!OP_RETURN_HEX) {
    throw new Error('OP_RETURN_HEX required (64 hex chars)');
  }
  if (!/^[0-9a-fA-F]+$/.test(OP_RETURN_HEX) || OP_RETURN_HEX.length % 2 !== 0) {
    throw new Error('OP_RETURN_HEX must be valid hex');
  }
  return Buffer.from(OP_RETURN_HEX, 'hex');
}

async function createOpReturnTx() {
  try {
    console.log('\n📝 Creating OP_RETURN Transaction: "Hello World"\n');
    
    // Fetch UTXOs
    console.log('1️⃣  Fetching UTXOs...');
    const utxosRes = await axios.get(`${BASE_URL}/api/${CHAIN}/${NETWORK}/address/${ADDRESS}/utxos`);
    const utxos = utxosRes.data.data.result;
    
    if (utxos.length === 0) {
      console.error('❌ No UTXOs available');
      process.exit(1);
    }
    
    const candidates = utxos
      .map(u => ({ ...u, value: Number(u.value) }))
      .filter(u => Number.isFinite(u.value) && u.value > 100)
      .filter(u => !u.isSpentInMempoolTx);

    const utxo = UTXO_TXID
      ? candidates.find(u => u.tx_hash === UTXO_TXID && (UTXO_VOUT === null || u.tx_pos === UTXO_VOUT))
      : candidates.sort((a, b) => b.value - a.value)[0];

    if (!utxo) {
      console.error('❌ No suitable UTXO found (check txid/vout or mempool conflicts)');
      process.exit(1);
    }
    console.log(`✅ Found UTXO: ${utxo.tx_hash.substring(0, 16)}... (${utxo.value} sats)`);
    
    // Build transaction with OP_RETURN
    console.log('\n2️⃣  Building OP_RETURN transaction...');
    const privateKey = bsv.PrivateKey.fromWIF(PRIVATE_KEY);
    
    // Create OP_RETURN script with provided hex
    const opReturnData = getOpReturnBuffer();
    const opReturnScript = bsv.Script.buildSafeDataOut(opReturnData);
    
    const tx = new bsv.Transaction()
      .from({
        txid: utxo.tx_hash,
        outputIndex: utxo.tx_pos,
        script: bsv.Script.fromHex(utxo.scriptPubKey),
        satoshis: utxo.value
      })
      .addOutput(new bsv.Transaction.Output({
        script: opReturnScript,
        satoshis: 0
      }))
      .change(ADDRESS)
      .feePerKb(FEE_RATE_PER_KB)
      .sign(privateKey);
    
    const txHex = tx.toString('hex');
    console.log(`✅ Transaction built`);
    console.log(`   TX Size: ${tx.toString().length / 2} bytes`);
    console.log(`   Input: ${utxo.value} sats`);
    console.log(`   OP_RETURN (hex): ${OP_RETURN_HEX}`);
    console.log(`   Fee rate: ${FEE_RATE_PER_KB} sats/KB`);
    console.log(`   Actual fee: ${tx.getFee()} sats`);
    console.log(`   Change: ${tx.outputs[1] ? tx.outputs[1].satoshis : 0} sats`);
    console.log(`   OP_RETURN Hex: ${opReturnScript.toHex()}`);
    console.log(`   Raw Hex: ${txHex}`);
    
    // Broadcast transaction
    console.log('\n3️⃣  Broadcasting transaction...');
    const broadcastRes = await axios.post(
      `${BASE_URL}/api/${CHAIN}/${NETWORK}/tx/broadcast`,
      { txHex: txHex },
      { headers: { 'Content-Type': 'application/json' } }
    );
    
    const txid = broadcastRes.data.data.txid || broadcastRes.data.data;
    console.log(`✅ Transaction broadcast successfully!`);
    console.log(`\n📊 Transaction Details:`);
    console.log(`   TXID: ${txid}`);
    console.log(`   Message: "Hello World"`);
    console.log(`   View: https://whatsonchain.com/tx/${txid}`);
    console.log(`\n   Raw Hex: ${txHex}`);
    
  } catch (error) {
    console.error('\n❌ Error:', error.response?.data || error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

createOpReturnTx();
