#!/usr/bin/env node
"use strict";
/**
 * UTXO Pool Replenisher - Automated pool depth maintenance
 *
 * Monitors the UTXO pool and automatically splits large UTXOs when depth
 * falls below threshold. Essential for sustained batch mode operation at
 * 166 tx/sec (10,000 UTXOs/minute consumption rate).
 *
 * Usage:
 *   npm run replenisher
 *   # or
 *   node dist/utxo-replenisher.js
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bsv_1 = __importDefault(require("@smartledger/bsv"));
const axios_1 = __importDefault(require("axios"));
const pg_1 = __importDefault(require("pg"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const { Pool } = pg_1.default;
// Configuration
const MIN_POOL_SIZE = parseInt(process.env.MIN_UTXO_POOL_SIZE || "5000", 10);
const TARGET_SPLIT_SIZE = parseInt(process.env.UTXO_SPLIT_SIZE || "10000", 10);
const CHECK_INTERVAL_MS = parseInt(process.env.POOL_CHECK_INTERVAL_MS || "30000", 10);
const SPLIT_COOLDOWN_MS = parseInt(process.env.SPLIT_COOLDOWN_MS || "600000", 10); // 10 min default
const UTXO_AMOUNT = 100; // sats per UTXO
const EXPLORER_BASE = process.env.EXPLORER_BASE_URL || "https://explorer.codenlighten.org";
const BSV_PRIVATE_KEY = process.env.BSV_PRIVATE_KEY;
const BSV_ADDRESS = process.env.BSV_ADDRESS;
const DATABASE_URL = process.env.DATABASE_URL;
const FEE_SAT_PER_KB = parseInt(process.env.FEE_SATS_PER_KB || "100", 10);
const pool = new Pool({ connectionString: DATABASE_URL });
// Track last split to prevent thrashing
let lastSplitTime = null;
console.log(`🔧 UTXO Pool Replenisher`);
console.log(`========================================`);
console.log(`Min Pool Size: ${MIN_POOL_SIZE.toLocaleString()} UTXOs`);
console.log(`Target Split Size: ${TARGET_SPLIT_SIZE.toLocaleString()} UTXOs`);
console.log(`Check Interval: ${CHECK_INTERVAL_MS / 1000}s`);
console.log(`Split Cooldown: ${SPLIT_COOLDOWN_MS / 1000}s`);
console.log(`UTXO Amount: ${UTXO_AMOUNT} sats`);
console.log(`========================================\n`);
/**
 * Get current UTXO pool statistics
 */
async function getPoolStats() {
    const result = await pool.query(`
    SELECT 
      COUNT(*) FILTER (WHERE satoshis = 100) as available_100sat,
      COUNT(*) as total_available,
      SUM(satoshis) as total_sats,
      (SELECT id FROM utxos 
       WHERE status = 'available' 
         AND purpose IN ('funding', 'change') 
         AND satoshis > 1000000
       ORDER BY satoshis DESC LIMIT 1) as largest_utxo_id,
      (SELECT satoshis FROM utxos 
       WHERE status = 'available' 
         AND purpose IN ('funding', 'change') 
         AND satoshis > 1000000
       ORDER BY satoshis DESC LIMIT 1) as largest_utxo_sats
    FROM utxos
    WHERE status = 'available' AND purpose = 'publish'
  `);
    return {
        available_100sat: parseInt(result.rows[0].available_100sat, 10),
        total_available: parseInt(result.rows[0].total_available, 10),
        total_sats: parseInt(result.rows[0].total_sats, 10),
        largest_utxo_id: result.rows[0].largest_utxo_id,
        largest_utxo_sats: result.rows[0].largest_utxo_sats
            ? parseInt(result.rows[0].largest_utxo_sats, 10)
            : null,
    };
}
/**
 * Split a large UTXO into many 100-sat outputs
 */
async function splitUtxo(sourceUtxoId, count) {
    // Get source UTXO details (must be funding/change purpose)
    const result = await pool.query(`SELECT id, txid, vout, satoshis, script_pub_key, address, purpose
     FROM utxos
     WHERE id = $1 
       AND status = 'available'
       AND purpose IN ('funding', 'change')`, [sourceUtxoId]);
    if (result.rows.length === 0) {
        throw new Error(`UTXO ${sourceUtxoId} not found or not available`);
    }
    const sourceUtxo = result.rows[0];
    // Calculate split
    const outputAmount = UTXO_AMOUNT;
    const totalNeeded = count * outputAmount;
    // Estimate fee
    const estimatedSize = 180 + count * 34 + 10;
    const estimatedFee = Math.ceil((estimatedSize * FEE_SAT_PER_KB) / 1000);
    const changeAmount = sourceUtxo.satoshis - totalNeeded - estimatedFee;
    if (changeAmount < 0) {
        throw new Error(`Insufficient funds: need ${totalNeeded + estimatedFee}, have ${sourceUtxo.satoshis}`);
    }
    console.log(`   Source UTXO: ${sourceUtxo.txid}:${sourceUtxo.vout}`);
    console.log(`   Satoshis: ${sourceUtxo.satoshis.toLocaleString()}`);
    console.log(`   Outputs: ${count} × ${outputAmount} = ${totalNeeded.toLocaleString()} sats`);
    console.log(`   Fee: ${estimatedFee} sats`);
    console.log(`   Change: ${changeAmount.toLocaleString()} sats`);
    // Build transaction
    const tx = new bsv_1.default.Transaction();
    tx.from({
        txid: sourceUtxo.txid,
        outputIndex: sourceUtxo.vout,
        script: bsv_1.default.Script.fromHex(sourceUtxo.script_pub_key),
        satoshis: sourceUtxo.satoshis,
    });
    // Add count outputs of 100 sats each
    for (let i = 0; i < count; i++) {
        tx.to(BSV_ADDRESS, outputAmount);
    }
    // Add change output if significant
    if (changeAmount > 546) {
        tx.to(BSV_ADDRESS, changeAmount);
    }
    tx.feePerKb(FEE_SAT_PER_KB * 1000);
    const privkey = bsv_1.default.PrivateKey.fromWIF(BSV_PRIVATE_KEY);
    tx.sign(privkey);
    const txHex = tx.toString("hex");
    const actualSize = tx.toBuffer().length;
    const actualFee = tx.getFee();
    console.log(`   TX size: ${actualSize} bytes, Fee: ${actualFee} sats`);
    // Broadcast
    const broadcastUrl = `${EXPLORER_BASE}/api/bsv/main/tx/broadcast`;
    const response = await axios_1.default.post(broadcastUrl, { txHex });
    const txid = response.data?.data || response.data?.result || response.data?.txid;
    if (!txid || !response.data?.success) {
        throw new Error(`Broadcast failed: ${JSON.stringify(response.data)}`);
    }
    console.log(`   ✅ Broadcast: ${txid}`);
    // Update database
    await pool.query(`UPDATE utxos SET status = 'spent', spent_at = NOW() WHERE id = $1`, [
        sourceUtxoId,
    ]);
    let insertedCount = 0;
    for (let vout = 0; vout < tx.outputs.length; vout++) {
        const output = tx.outputs[vout];
        if (output.satoshis === outputAmount) {
            await pool.query(`INSERT INTO utxos (txid, vout, satoshis, script_pub_key, address, purpose, status)
         VALUES ($1, $2, $3, $4, $5, 'publish', 'available')
         ON CONFLICT (txid, vout) DO NOTHING`, [txid, vout, output.satoshis, output.script.toHex(), BSV_ADDRESS]);
            insertedCount++;
        }
        else if (output.satoshis > outputAmount) {
            // Change output (mark as 'change' for future splitting)
            await pool.query(`INSERT INTO utxos (txid, vout, satoshis, script_pub_key, address, purpose, status)
         VALUES ($1, $2, $3, $4, $5, 'change', 'available')
         ON CONFLICT (txid, vout) DO NOTHING`, [txid, vout, output.satoshis, output.script.toHex(), BSV_ADDRESS]);
        }
    }
    return { txid, outputs: insertedCount };
}
/**
 * Check pool and replenish if needed
 */
async function checkAndReplenish() {
    try {
        const stats = await getPoolStats();
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] Pool Status:`);
        console.log(`   100-sat UTXOs: ${stats.available_100sat.toLocaleString()}`);
        console.log(`   Total available: ${stats.total_available.toLocaleString()}`);
        console.log(`   Total value: ${(stats.total_sats / 100000000).toFixed(8)} BSV`);
        if (stats.available_100sat < MIN_POOL_SIZE) {
            console.log(`\n⚠️  Pool below threshold (${MIN_POOL_SIZE.toLocaleString()})!`);
            // Check cooldown to prevent thrashing during load tests
            const now = Date.now();
            if (lastSplitTime && (now - lastSplitTime) < SPLIT_COOLDOWN_MS) {
                const remainingMs = SPLIT_COOLDOWN_MS - (now - lastSplitTime);
                console.log(`⏳ Cooldown active: ${Math.ceil(remainingMs / 1000)}s remaining`);
                console.log(`   (prevents false triggers during mid-flight UTXO transitions)`);
                return;
            }
            if (!stats.largest_utxo_id || !stats.largest_utxo_sats) {
                console.log(`❌ No large UTXO available for splitting`);
                console.log(`   Manual action required: fund ${BSV_ADDRESS} with at least 1 BSV`);
                return;
            }
            console.log(`\n🔧 Replenishing pool...`);
            console.log(`   Target: ${TARGET_SPLIT_SIZE.toLocaleString()} new UTXOs`);
            const result = await splitUtxo(stats.largest_utxo_id, TARGET_SPLIT_SIZE);
            // Update cooldown timestamp
            lastSplitTime = Date.now();
            console.log(`\n✅ Replenishment complete!`);
            console.log(`   TXID: ${result.txid}`);
            console.log(`   New UTXOs: ${result.outputs.toLocaleString()}`);
            console.log(`   Explorer: ${EXPLORER_BASE}/tx/${result.txid}\n`);
            // Check stats again
            const newStats = await getPoolStats();
            console.log(`📊 Updated Pool:`);
            console.log(`   100-sat UTXOs: ${newStats.available_100sat.toLocaleString()}`);
            console.log(`   Duration at 166 tx/sec: ~${(newStats.available_100sat / 166 / 60).toFixed(1)} minutes\n`);
        }
        else {
            const durationMinutes = stats.available_100sat / 166 / 60;
            console.log(`   ✅ Pool healthy (${durationMinutes.toFixed(1)} min @ 166 tx/sec)\n`);
        }
    }
    catch (error) {
        console.error(`❌ Error in checkAndReplenish:`, error);
    }
}
/**
 * Main loop
 */
async function main() {
    console.log(`🚀 Starting replenisher loop...\n`);
    // Initial check
    await checkAndReplenish();
    // Periodic checks
    setInterval(async () => {
        await checkAndReplenish();
    }, CHECK_INTERVAL_MS);
}
// Handle shutdown
process.on("SIGINT", async () => {
    console.log(`\n🛑 Shutting down replenisher...`);
    await pool.end();
    process.exit(0);
});
process.on("SIGTERM", async () => {
    console.log(`\n🛑 Shutting down replenisher...`);
    await pool.end();
    process.exit(0);
});
main().catch((err) => {
    console.error(`Fatal error:`, err);
    process.exit(1);
});
//# sourceMappingURL=utxo-replenisher.js.map