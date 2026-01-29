#!/usr/bin/env node

/**
 * Split UTXOs for publishing pool
 * Creates N × 100-sat UTXOs + change output
 * 
 * Usage: node split-utxos.js <count>
 * Example: node split-utxos.js 102
 */

const bsv = require('@smartledger/bsv');
const axios = require('axios');
const { initDb, closeDb, getPool } = require('./src/db/connection');

require('dotenv').config();

const EXPLORER_BASE = process.env.EXPLORER_BASE_URL || 'https://explorer.codenlighten.org';
const BSV_PRIVATE_KEY = process.env.BSV_PRIVATE_KEY;
const BSV_ADDRESS = process.env.BSV_ADDRESS;
const FEE_SAT_PER_KB = parseInt(process.env.FEE_SATS_PER_KB || '100', 10);
const UTXO_VALUE = 100; // satoshis per UTXO

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

async function getFundingUTXO() {
  const response = await axios.get(`${EXPLORER_BASE}/api/bsv/main/address/${BSV_ADDRESS}/utxos`);
  const utxos = response.data || [];
  
  if (utxos.length === 0) {
    throw new Error('No UTXOs found for funding address');
  }
  
  // Get largest confirmed UTXO
  const confirmed = utxos.filter(u => u.status === 'confirmed');
  if (confirmed.length === 0) {
    throw new Error('No confirmed UTXOs available');
  }
  
  const largest = confirmed.sort((a, b) => b.value - a.value)[0];
  
  return {
    txid: largest.tx_hash,
    vout: largest.tx_pos,
    satoshis: largest.value,
    script: bsv.Script.fromAddress(BSV_ADDRESS).toHex(),
  };
}

async function buildSplitTx(fundingUtxo, count, utxoValue) {
  const privkey = bsv.PrivateKey.fromWIF(BSV_PRIVATE_KEY);
  const tx = new bsv.Transaction();
  
  // Add input
  tx.from({
    txid: fundingUtxo.txid,
    outputIndex: fundingUtxo.vout,
    script: bsv.Script.fromHex(fundingUtxo.script),
    satoshis: fundingUtxo.satoshis,
  });
  
  // Add pool outputs (count × utxoValue)
  for (let i = 0; i < count; i++) {
    tx.to(BSV_ADDRESS, utxoValue);
  }
  
  // Add change output
  tx.change(BSV_ADDRESS);
  tx.feePerKb(FEE_SAT_PER_KB * 1000); // Convert per KB
  
  // Sign
  tx.sign(privkey);
  
  const txHex = tx.toString('hex');
  const txSize = tx.toBuffer().length;
  const fee = Math.ceil((txSize / 1000) * FEE_SAT_PER_KB);
  const totalPoolValue = count * utxoValue;
  const change = fundingUtxo.satoshis - totalPoolValue - fee;
  
  return {
    tx,
    txHex,
    txid: tx.id,
    txSize,
    fee,
    change,
    totalPoolValue,
  };
}

async function broadcastTx(txHex) {
  const response = await axios.post(
    `${EXPLORER_BASE}/api/bsv/main/tx/broadcast`,
    { rawtx: txHex },
    { headers: { 'Content-Type': 'application/json' } }
  );
  
  return response.data.txid || response.data.hash || response.data;
}

async function insertUTXOs(txid, count, utxoValue, changeValue) {
  const pool = getPool();
  
  // Insert pool UTXOs
  for (let i = 0; i < count; i++) {
    await pool.query(
      `INSERT INTO utxos (txid, vout, satoshis, script_pub_key, address, purpose, status)
       VALUES ($1, $2, $3, $4, $5, 'publish', 'available')
       ON CONFLICT (txid, vout) DO UPDATE SET status = 'available'`,
      [txid, i, utxoValue, bsv.Script.fromAddress(BSV_ADDRESS).toHex(), BSV_ADDRESS]
    );
  }
  
  // Insert change UTXO
  if (changeValue > 0) {
    await pool.query(
      `INSERT INTO utxos (txid, vout, satoshis, script_pub_key, address, purpose, status)
       VALUES ($1, $2, $3, $4, $5, 'change', 'available')
       ON CONFLICT (txid, vout) DO UPDATE SET status = 'available'`,
      [txid, count, changeValue, bsv.Script.fromAddress(BSV_ADDRESS).toHex(), BSV_ADDRESS]
    );
  }
}

async function getPoolStats() {
  const pool = getPool();
  const result = await pool.query(
    `SELECT purpose, status, COUNT(*) as count, SUM(satoshis) as total_sats
     FROM utxos
     GROUP BY purpose, status
     ORDER BY purpose, status`
  );
  return result.rows;
}

async function main() {
  const count = parseInt(process.argv[2], 10);
  
  if (!count || count < 1) {
    console.error(`${colors.red}Error: Invalid count${colors.reset}`);
    console.error('Usage: node split-utxos.js <count>');
    console.error('Example: node split-utxos.js 102');
    process.exit(1);
  }
  
  if (!BSV_PRIVATE_KEY || !BSV_ADDRESS) {
    console.error(`${colors.red}Error: Missing BSV configuration${colors.reset}`);
    console.error('Required: BSV_PRIVATE_KEY, BSV_ADDRESS');
    process.exit(1);
  }
  
  console.log(`${colors.blue}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.blue}UTXO Pool Split${colors.reset}`);
  console.log(`${colors.blue}${'='.repeat(60)}${colors.reset}\n`);
  
  console.log('Configuration:');
  console.log(`  Address: ${BSV_ADDRESS}`);
  console.log(`  Count: ${count} UTXOs`);
  console.log(`  Value per UTXO: ${UTXO_VALUE} sats`);
  console.log(`  Total Pool Value: ${count * UTXO_VALUE} sats`);
  console.log(`  Explorer: ${EXPLORER_BASE}\n`);
  
  try {
    // Initialize database
    console.log(`${colors.yellow}[1/6]${colors.reset} Initializing database...`);
    await initDb();
    console.log(`${colors.green}✓ Database connected${colors.reset}\n`);
    
    // Get current pool stats
    console.log(`${colors.yellow}[2/6]${colors.reset} Current pool status:`);
    const beforeStats = await getPoolStats();
    beforeStats.forEach(stat => {
      console.log(`  ${stat.purpose} (${stat.status}): ${stat.count} UTXOs, ${stat.total_sats} sats`);
    });
    console.log('');
    
    // Get funding UTXO
    console.log(`${colors.yellow}[3/6]${colors.reset} Fetching funding UTXO...`);
    const fundingUtxo = await getFundingUTXO();
    console.log(`${colors.green}✓ Found UTXO: ${fundingUtxo.txid.substring(0, 16)}...${colors.reset}`);
    console.log(`  Value: ${fundingUtxo.satoshis} sats\n`);
    
    // Validate sufficient funds
    const required = (count * UTXO_VALUE) + 1000; // Pool + estimated fee
    if (fundingUtxo.satoshis < required) {
      throw new Error(
        `Insufficient funds: UTXO has ${fundingUtxo.satoshis} sats, need ${required} sats`
      );
    }
    
    // Build transaction
    console.log(`${colors.yellow}[4/6]${colors.reset} Building split transaction...`);
    const splitResult = buildSplitTx(fundingUtxo, count, UTXO_VALUE);
    console.log(`${colors.green}✓ Transaction built${colors.reset}`);
    console.log(`  TX ID: ${splitResult.txid}`);
    console.log(`  Size: ${splitResult.txSize} bytes`);
    console.log(`  Fee: ${splitResult.fee} sats`);
    console.log(`  Change: ${splitResult.change} sats\n`);
    
    // Broadcast
    console.log(`${colors.yellow}[5/6]${colors.reset} Broadcasting transaction...`);
    const txid = await broadcastTx(splitResult.txHex);
    console.log(`${colors.green}✓ Transaction broadcast${colors.reset}`);
    console.log(`  TXID: ${txid}\n`);
    
    // Wait for mempool
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Insert UTXOs into database
    console.log(`${colors.yellow}[6/6]${colors.reset} Storing UTXOs in database...`);
    await insertUTXOs(txid, count, UTXO_VALUE, splitResult.change);
    console.log(`${colors.green}✓ Stored ${count} pool UTXOs + 1 change UTXO${colors.reset}\n`);
    
    // Display updated pool stats
    console.log(`${colors.yellow}Updated pool status:${colors.reset}`);
    const afterStats = await getPoolStats();
    afterStats.forEach(stat => {
      console.log(`  ${stat.purpose} (${stat.status}): ${stat.count} UTXOs, ${stat.total_sats} sats`);
    });
    
    console.log(`\n${colors.blue}${'='.repeat(60)}${colors.reset}`);
    console.log(`${colors.green}✓ Split Complete!${colors.reset}`);
    console.log(`${colors.blue}${'='.repeat(60)}${colors.reset}\n`);
    
    console.log('Next steps:');
    console.log('1. Wait for transaction to confirm (a few minutes)');
    console.log('2. Test publishing with: API_URL=https://api.raregeneration.me npx ts-node test-publish-signed.ts');
    console.log(`3. View on blockchain: ${EXPLORER_BASE}/tx/${txid}`);
    
  } catch (error) {
    console.error(`${colors.red}✗ Error: ${error.message}${colors.reset}`);
    if (error.response?.data) {
      console.error(`${colors.red}Response: ${JSON.stringify(error.response.data)}${colors.reset}`);
    }
    process.exit(1);
  } finally {
    await closeDb();
  }
}

main();
