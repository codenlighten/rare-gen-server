#!/usr/bin/env node

/**
 * Monitor Pool Status
 * Displays current pool statistics and recent publishes
 */

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

async function monitorPool() {
  if (!process.env.PG_URL) {
    console.error(`${colors.red}Error: Missing PG_URL in .env${colors.reset}`);
    process.exit(1);
  }

  console.log(`${colors.blue}${'='.repeat(50)}${colors.reset}`);
  console.log(`${colors.blue}Publisher Pool Monitor${colors.reset}`);
  console.log(`${colors.blue}${'='.repeat(50)}${colors.reset}\n`);

  try {
    await initDb();
    await runMigrations();

    // Pool statistics
    console.log(`${colors.yellow}Pool Statistics${colors.reset}`);
    const stats = await UTXOPoolManager.getPoolStats();

    const table = {};
    stats.forEach(stat => {
      if (!table[stat.purpose]) {
        table[stat.purpose] = {};
      }
      table[stat.purpose][stat.status] = {
        count: stat.count,
        total: stat.total_satoshis,
      };
    });

    Object.entries(table).forEach(([purpose, statuses]) => {
      console.log(`\n  ${purpose}:`);
      Object.entries(statuses).forEach(([status, data]) => {
        const bar = '█'.repeat(Math.floor(data.count / 10));
        console.log(`    ${status.padEnd(12)} ${data.count.toString().padEnd(5)} UTXOs (${data.total} sats) ${bar}`);
      });
    });

    // Recent publishes
    console.log(`\n${colors.yellow}Recent Publishes (last 10)${colors.reset}`);
    const pool = getPool();
    const result = await pool.query(
      `SELECT sha256, txid, status, created_at 
       FROM publishes 
       ORDER BY created_at DESC 
       LIMIT 10`
    );

    if (result.rows.length === 0) {
      console.log('  (No publishes yet)');
    } else {
      result.rows.forEach((row, idx) => {
        const timestamp = new Date(row.created_at).toISOString();
        const statusIcon = row.status === 'confirmed' ? '✓' : '⊙';
        console.log(`  ${(idx + 1).toString().padEnd(2)} ${statusIcon} ${row.sha256.substring(0, 16)}... → ${row.txid.substring(0, 16)}... [${timestamp}]`);
      });
    }

    // Overall stats
    console.log(`\n${colors.yellow}Overall Statistics${colors.reset}`);
    const statsResult = await pool.query(
      `SELECT 
        (SELECT COUNT(*) FROM utxos WHERE status = 'available') as available,
        (SELECT COUNT(*) FROM utxos WHERE status = 'reserved') as reserved,
        (SELECT COUNT(*) FROM utxos WHERE status = 'spent') as spent,
        (SELECT COUNT(*) FROM publishes) as total_publishes,
        (SELECT COUNT(*) FROM publishes WHERE status = 'confirmed') as confirmed_publishes
       `
    );

    const overall = statsResult.rows[0];
    console.log(`  Available: ${overall.available}`);
    console.log(`  Reserved: ${overall.reserved}`);
    console.log(`  Spent: ${overall.spent}`);
    console.log(`  Total Publishes: ${overall.total_publishes}`);
    console.log(`  Confirmed: ${overall.confirmed_publishes}`);

  } catch (err) {
    console.error(`${colors.red}✗ Error: ${err.message}${colors.reset}`);
    process.exit(1);
  } finally {
    await closeDb();
  }
}

monitorPool();
