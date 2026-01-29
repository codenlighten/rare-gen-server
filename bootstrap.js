#!/usr/bin/env node

/**
 * Bootstrap Workflow
 * Creates initial UTXO pool: 1000 × 50-sat UTXOs + change output
 * 
 * Usage: node bootstrap.js <explorer_url> [pool_size] [pool_value]
 */

const ExplorerClient = require('./src/explorer/client');
const TransactionBuilder = require('./src/transactions/builder');
const UTXOPoolManager = require('./src/pool/manager');
const { initDb, closeDb } = require('./src/db/connection');
const { runMigrations } = require('./src/db/migrations');

require('dotenv').config();

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
};

async function bootstrap() {
  const explorerUrl = process.argv[2];
  const poolSize = parseInt(process.argv[3], 10) || 1000;
  const poolValue = parseInt(process.argv[4], 10) || 100;

  // Validate config
  if (!explorerUrl) {
    console.error(`${colors.red}Error: Explorer URL required${colors.reset}`);
    console.error('Usage: node bootstrap.js <explorer_url> [pool_size] [pool_value]');
    process.exit(1);
  }

  if (!process.env.FUNDING_WIF || !process.env.FUNDING_ADDRESS || !process.env.CHANGE_ADDRESS) {
    console.error(`${colors.red}Error: Missing .env configuration${colors.reset}`);
    console.error('Required: FUNDING_WIF, FUNDING_ADDRESS, CHANGE_ADDRESS');
    process.exit(1);
  }

  if (!process.env.PG_URL) {
    console.error(`${colors.red}Error: Missing PG_URL in .env${colors.reset}`);
    process.exit(1);
  }

  console.log(`${colors.blue}${'='.repeat(50)}${colors.reset}`);
  console.log(`${colors.blue}Publisher Bootstrap Workflow${colors.reset}`);
  console.log(`${colors.blue}${'='.repeat(50)}${colors.reset}\n`);

  console.log('Configuration:');
  console.log(`  Explorer URL: ${explorerUrl}`);
  console.log(`  Funding Address: ${process.env.FUNDING_ADDRESS}`);
  console.log(`  Change Address: ${process.env.CHANGE_ADDRESS}`);
  console.log(`  Pool Size: ${poolSize} UTXOs`);
  console.log(`  Pool Value: ${poolValue} sats each`);
  console.log(`  Total Pool Value: ${poolSize * poolValue} sats`);
  console.log('');

  try {
    // Initialize database
    console.log(`${colors.yellow}[Step 1]${colors.reset} Initializing database...`);
    await initDb();
    await runMigrations();
    console.log(`${colors.green}✓ Database initialized${colors.reset}\n`);

    // Check existing pool
    const existingStats = await UTXOPoolManager.getPoolStats();
    const availableCount = existingStats.find(s => s.status === 'available' && s.purpose === 'publish_pool')?.count || 0;
    
    if (availableCount >= poolSize * 0.8) { // If 80%+ of pool exists
      console.log(`${colors.yellow}⚠ Pool already exists with ${availableCount} available UTXOs${colors.reset}`);
      console.log(`${colors.yellow}Syncing with blockchain...${colors.reset}\n`);
    }

    // Initialize explorer client
    const explorer = new ExplorerClient(explorerUrl);

    // Fetch funding address UTXOs
    console.log(`${colors.yellow}[Step 2]${colors.reset} Fetching funding UTXOs from blockchain...`);
    const allUtxos = await explorer.getUTXOs(process.env.FUNDING_ADDRESS, false);
    if (allUtxos.length === 0) {
      throw new Error('No UTXOs found for funding address');
    }
    
    // Filter to confirmed UTXOs only (avoids mempool conflicts)
    const utxos = allUtxos.filter(u => u.status === 'confirmed');
    if (utxos.length === 0) {
      console.log(`${colors.yellow}⚠ All ${allUtxos.length} UTXOs are unconfirmed. Waiting 10 seconds...${colors.reset}`);
      await new Promise(resolve => setTimeout(resolve, 10000));
      const retryUtxos = await explorer.getUTXOs(process.env.FUNDING_ADDRESS, false);
      const confirmedRetry = retryUtxos.filter(u => u.status === 'confirmed');
      if (confirmedRetry.length === 0) {
        throw new Error('No confirmed UTXOs available. Please wait for confirmations.');
      }
      utxos.push(...confirmedRetry);
    }
    
    console.log(`${colors.green}✓ Found ${utxos.length} confirmed UTXOs${colors.reset}`);
    
    const fundingUTXO = utxos.sort((a, b) => b.value - a.value)[0];
    const fundingValue = fundingUTXO.value;
    console.log(`  Using UTXO: ${fundingUTXO.tx_hash} (${fundingValue} sats, ${fundingUTXO.status})\n`);

    // Validate sufficient funds
    const requiredSats = (poolSize * poolValue) + 1000; // Pool + estimated fee
    if (fundingValue < requiredSats) {
      throw new Error(
        `Insufficient funds: UTXO has ${fundingValue} sats, need ${requiredSats} sats (pool + fee)`
      );
    }

    // Build split transaction
    console.log(`${colors.yellow}[Step 3]${colors.reset} Building split transaction...`);
    const builder = new TransactionBuilder(parseFloat(process.env.FEE_RATE_SAT_PER_BYTE || '0.01'));
    const splitResult = builder.buildSplitTx(
      fundingUTXO,
      process.env.FUNDING_WIF,
      process.env.CHANGE_ADDRESS,
      poolSize,
      poolValue
    );

    console.log(`${colors.green}✓ Split transaction built${colors.reset}`);
    console.log(`  TX Size: ${splitResult.txSize} bytes`);
    console.log(`  Fee: ${splitResult.fee} sats`);
    console.log(`  Change: ${splitResult.change} sats`);
    console.log(`  TX ID (pending): ${splitResult.tx.id}\n`);

    // Broadcast split transaction
    console.log(`${colors.cyan}TX Hex (pre-broadcast):${colors.reset} ${splitResult.txHex}`);
    console.log(`${colors.yellow}[Step 4]${colors.reset} Broadcasting split transaction...`);
    const splitTxid = await explorer.broadcastRawTx(splitResult.txHex);
    console.log(`${colors.green}✓ Transaction broadcast${colors.reset}`);
    console.log(`  TXID: ${splitTxid}`);
    console.log(`  Syncing with blockchain mempool...`);
    
    // Wait briefly for mempool propagation
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Verify transaction in mempool
    try {
      await explorer.getTxDetails(splitTxid);
      console.log(`${colors.green}✓ Transaction confirmed in mempool${colors.reset}\n`);
    } catch (err) {
      console.log(`${colors.yellow}⚠ Transaction not yet in mempool (will propagate shortly)${colors.reset}\n`);
    }

    // Store UTXOs in database
    console.log(`${colors.yellow}[Step 5]${colors.reset} Storing pool UTXOs in database...`);
    const utsosToInsert = [];

    // Pool outputs (0 to poolSize-1)
    for (let i = 0; i < poolSize; i++) {
      utsosToInsert.push({
        txid: splitTxid,
        vout: i,
        satoshis: poolValue,
        scriptPubKey: fundingUTXO.scriptPubKey,
        address: process.env.FUNDING_ADDRESS,
        purpose: 'publish_pool',
      });
    }

    // Change output (last)
    if (splitResult.change > 0) {
      utsosToInsert.push({
        txid: splitTxid,
        vout: poolSize,
        satoshis: splitResult.change,
        scriptPubKey: fundingUTXO.scriptPubKey,
        address: process.env.CHANGE_ADDRESS,
        purpose: 'change',
      });
    }

    const insertedUTXOs = await UTXOPoolManager.insertBatch(utsosToInsert);
    console.log(`${colors.green}✓ Stored ${insertedUTXOs.length} UTXOs${colors.reset}\n`);

    // Display pool statistics
    console.log(`${colors.yellow}[Step 6]${colors.reset} Pool Statistics`);
    const stats = await UTXOPoolManager.getPoolStats();
    console.log(`${colors.green}✓ Current pool state:${colors.reset}`);
    
    stats.forEach(stat => {
      console.log(`  ${stat.purpose} (${stat.status}): ${stat.count} UTXOs, ${stat.total_satoshis} sats`);
    });

    console.log(`\n${colors.blue}${'='.repeat(50)}${colors.reset}`);
    console.log(`${colors.green}✓ Bootstrap Complete!${colors.reset}`);
    console.log(`${colors.blue}${'='.repeat(50)}${colors.reset}`);
    console.log(`\nNext steps:`);
    console.log(`1. Wait for split transaction to confirm (a few minutes)`);
    console.log(`2. Start publishing hashes using: node publish.js <explorer_url> <hash>`);
    console.log(`3. Monitor pool: node monitor-pool.js`);

  } catch (err) {
    console.error(`${colors.red}✗ Error: ${err.message}${colors.reset}`);
    process.exit(1);
  } finally {
    await closeDb();
  }
}

bootstrap();
