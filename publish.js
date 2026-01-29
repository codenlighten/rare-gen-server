#!/usr/bin/env node

/**
 * Hash Publish Workflow
 * Reserves a UTXO from the pool, builds OP_RETURN transaction, broadcasts it
 * 
 * Usage: node publish.js <explorer_url> <hash_hex>
 */

const ExplorerClient = require('./src/explorer/client');
const TransactionBuilder = require('./src/transactions/builder');
const UTXOPoolManager = require('./src/pool/manager');
const { initDb, closeDb, getPool } = require('./src/db/connection');
const { runMigrations } = require('./src/db/migrations');

require('dotenv').config();

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
};

async function publishHash() {
  const explorerUrl = process.argv[2];
  const hashHex = process.argv[3];

  // Validate inputs
  if (!explorerUrl || !hashHex) {
    console.error(`${colors.red}Error: Explorer URL and hash required${colors.reset}`);
    console.error('Usage: node publish.js <explorer_url> <hash_hex>');
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

  // Validate hash hex format
  if (!/^[a-f0-9]+$/.test(hashHex)) {
    console.error(`${colors.red}Error: Invalid hash format (must be hex)${colors.reset}`);
    process.exit(1);
  }

  console.log(`${colors.blue}${'='.repeat(50)}${colors.reset}`);
  console.log(`${colors.blue}Publish Hash${colors.reset}`);
  console.log(`${colors.blue}${'='.repeat(50)}${colors.reset}\n`);

  console.log('Configuration:');
  console.log(`  Explorer URL: ${explorerUrl}`);
  console.log(`  Hash: ${hashHex}`);
  console.log('');

  let reservedUTXO = null;

  try {
    // Initialize database
    console.log(`${colors.yellow}[Step 1]${colors.reset} Initializing database...`);
    await initDb();
    await runMigrations();
    console.log(`${colors.green}✓ Database ready${colors.reset}\n`);

    // Check pool availability
    console.log(`${colors.yellow}[Step 2]${colors.reset} Checking pool...`);
    const availableCount = await UTXOPoolManager.getAvailableCount('publish_pool');
    console.log(`${colors.green}✓ Available UTXOs: ${availableCount}${colors.reset}`);

    // Daily rate limit guardrail
    const maxPerDay = parseInt(process.env.MAX_TX_PER_DAY || '0', 10);
    if (Number.isFinite(maxPerDay) && maxPerDay > 0) {
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS count
         FROM publishes
         WHERE created_at >= date_trunc('day', now())
           AND created_at < date_trunc('day', now()) + interval '1 day'`
      );
      if (rows[0].count >= maxPerDay) {
        throw new Error(`Rate limit exceeded: MAX_TX_PER_DAY=${maxPerDay}`);
      }
    }

    if (availableCount === 0) {
      throw new Error('No available UTXOs in pool. Run bootstrap.js to refill.');
    }

    if (availableCount < 10) {
      console.log(`${colors.yellow}⚠ Warning: Pool running low (${availableCount} remaining)${colors.reset}`);
    }

    console.log('');

    // Reserve a UTXO
    console.log(`${colors.yellow}[Step 3]${colors.reset} Reserving UTXO...`);
    reservedUTXO = await UTXOPoolManager.reserveUTXO('publish_pool');

    if (!reservedUTXO) {
      throw new Error('Failed to reserve UTXO (race condition?)');
    }

    console.log(`${colors.green}✓ UTXO reserved${colors.reset}`);
    console.log(`  ID: ${reservedUTXO.id}`);
    console.log(`  TXID: ${reservedUTXO.txid}:${reservedUTXO.vout}`);
    console.log(`  Value: ${reservedUTXO.satoshis} sats\n`);

    // Build publish transaction
    console.log(`${colors.yellow}[Step 4]${colors.reset} Building publish transaction...`);
    const explorer = new ExplorerClient(explorerUrl);
    const builder = new TransactionBuilder(parseFloat(process.env.FEE_RATE_SAT_PER_BYTE || '0.01'));

    const publishResult = builder.buildPublishTx(
      reservedUTXO,
      hashHex,
      process.env.FUNDING_WIF,
      process.env.CHANGE_ADDRESS,
      false // Don't return change (burn to fee)
    );

    console.log(`${colors.green}✓ Publish transaction built${colors.reset}`);
    console.log(`  TX Size: ${publishResult.txSize} bytes`);
    console.log(`  Fee: ${publishResult.fee} sats\n`);

    // Broadcast transaction
    console.log(`${colors.yellow}[Step 5]${colors.reset} Broadcasting transaction...`);
    const publishTxid = await explorer.broadcastRawTx(publishResult.txHex);
    console.log(`${colors.green}✓ Transaction broadcast${colors.reset}`);
    console.log(`  TXID: ${publishTxid}\n`);

    // Mark UTXO as spent
    console.log(`${colors.yellow}[Step 6]${colors.reset} Recording audit log...`);
    await UTXOPoolManager.markSpent(reservedUTXO.id);

    // Write publish record
    const pool = getPool();
    await pool.query(
      `INSERT INTO publishes (sha256, txid, utxo_txid, utxo_vout, tx_hex, tx_size, fee_sats, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'broadcast')`,
      [hashHex, publishTxid, reservedUTXO.txid, reservedUTXO.vout, publishResult.txHex, publishResult.txSize, publishResult.fee]
    );

    console.log(`${colors.green}✓ Audit record created${colors.reset}\n`);

    // Summary
    console.log(`${colors.blue}${'='.repeat(50)}${colors.reset}`);
    console.log(`${colors.green}✓ Hash Published!${colors.reset}`);
    console.log(`${colors.blue}${'='.repeat(50)}${colors.reset}`);
    console.log(`\nPublish Summary:`);
    console.log(`  SHA256: ${hashHex}`);
    console.log(`  Publish TXID: ${publishTxid}`);
    console.log(`  Pool UTXO: ${reservedUTXO.txid}:${reservedUTXO.vout}`);

  } catch (err) {
    console.error(`${colors.red}✗ Error: ${err.message}${colors.reset}`);

    // Release reserved UTXO on error
    if (reservedUTXO) {
      try {
        await UTXOPoolManager.releaseReserved(reservedUTXO.id);
        console.log(`${colors.yellow}⚠ Reserved UTXO released (retry available)${colors.reset}`);
      } catch (releaseErr) {
        console.error(`${colors.red}✗ Failed to release UTXO: ${releaseErr.message}${colors.reset}`);
      }
    }

    process.exit(1);
  } finally {
    await closeDb();
  }
}

publishHash();
