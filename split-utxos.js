#!/usr/bin/env node
"use strict";
/**
 * Split UTXOs into multiple 100-sat outputs for publish pool
 * Usage: npx ts-node split-utxos.ts <count>
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
const EXPLORER_BASE = process.env.EXPLORER_BASE_URL || "https://explorer.codenlighten.org";
const BSV_PRIVATE_KEY = process.env.BSV_PRIVATE_KEY;
const BSV_ADDRESS = process.env.BSV_ADDRESS;
const DATABASE_URL = process.env.DATABASE_URL;
const FEE_SAT_PER_KB = parseInt(process.env.FEE_SATS_PER_KB || "100", 10);
const COUNT = parseInt(process.argv[2] || "102", 10);
console.log(`🔧 UTXO Splitter - Creating ${COUNT} outputs of 100 sats each`);
console.log(`=====================================`);
async function main() {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
        // 1. Get available UTXO from database
        console.log("\n[Step 1] Fetching available UTXO from pool...");
        const result = await pool.query(`SELECT id, txid, vout, satoshis, script_pub_key, address
       FROM utxos
       WHERE status = 'available' AND purpose = 'publish'
       ORDER BY satoshis DESC
       LIMIT 1`);
        if (result.rows.length === 0) {
            console.log("❌ No available UTXOs found");
            console.log("\nFetch UTXOs for address:", BSV_ADDRESS);
            console.log(`   ${EXPLORER_BASE}/api/bsv/main/address/${BSV_ADDRESS}/utxos`);
            process.exit(1);
        }
        const sourceUtxo = result.rows[0];
        console.log(`✅ Found UTXO: ${sourceUtxo.txid}:${sourceUtxo.vout}`);
        console.log(`   Satoshis: ${sourceUtxo.satoshis}`);
        console.log(`   Address: ${sourceUtxo.address}`);
        // 2. Calculate split
        const outputAmount = 100; // 100 sats per output
        const totalNeeded = COUNT * outputAmount;
        // Estimate transaction size and fee
        // Rough estimate: 1 input (180 bytes) + COUNT outputs (34 bytes each) + overhead (10 bytes)
        const estimatedSize = 180 + (COUNT * 34) + 10;
        const estimatedFee = Math.ceil((estimatedSize * FEE_SAT_PER_KB) / 1000);
        const changeAmount = sourceUtxo.satoshis - totalNeeded - estimatedFee;
        console.log(`\n[Step 2] Calculating split...`);
        console.log(`   Source: ${sourceUtxo.satoshis} sats`);
        console.log(`   Outputs: ${COUNT} × ${outputAmount} = ${totalNeeded} sats`);
        console.log(`   Fee (est): ${estimatedFee} sats`);
        console.log(`   Change: ${changeAmount} sats`);
        if (changeAmount < 0) {
            console.log(`❌ Insufficient funds in UTXO`);
            process.exit(1);
        }
        // 3. Build transaction
        console.log(`\n[Step 3] Building split transaction...`);
        const tx = new bsv_1.default.Transaction();
        // Add input
        tx.from({
            txid: sourceUtxo.txid,
            outputIndex: sourceUtxo.vout,
            script: bsv_1.default.Script.fromHex(sourceUtxo.script_pub_key),
            satoshis: sourceUtxo.satoshis,
        });
        // Add COUNT outputs of 100 sats each
        for (let i = 0; i < COUNT; i++) {
            tx.to(BSV_ADDRESS, outputAmount);
        }
        // Add change output if significant
        if (changeAmount > 546) { // dust threshold
            tx.to(BSV_ADDRESS, changeAmount);
        }
        // Set fee rate
        tx.feePerKb(FEE_SAT_PER_KB * 1000);
        // Sign
        const privkey = bsv_1.default.PrivateKey.fromWIF(BSV_PRIVATE_KEY);
        tx.sign(privkey);
        const txHex = tx.toString("hex");
        const actualSize = tx.toBuffer().length;
        const actualFee = tx.getFee();
        console.log(`✅ Transaction built`);
        console.log(`   Size: ${actualSize} bytes`);
        console.log(`   Fee: ${actualFee} sats (${(actualFee / actualSize).toFixed(2)} sat/byte)`);
        console.log(`   Outputs: ${tx.outputs.length}`);
        // 4. Broadcast
        console.log(`\n[Step 4] Broadcasting transaction...`);
        const broadcastUrl = `${EXPLORER_BASE}/api/bsv/main/tx/broadcast`;
        const response = await axios_1.default.post(broadcastUrl, { txHex: txHex });
        const txid = response.data?.data || response.data?.result || response.data?.txid;
        if (!txid || !response.data?.success) {
            console.log("❌ Broadcast failed:", JSON.stringify(response.data, null, 2));
            process.exit(1);
        }
        console.log(`✅ Broadcast successful`);
        console.log(`   TXID: ${txid}`);
        console.log(`   Explorer: ${EXPLORER_BASE}/tx/${txid}`);
        // 5. Update database
        console.log(`\n[Step 5] Updating database...`);
        // Mark source UTXO as spent
        await pool.query(`UPDATE utxos SET status = 'spent', spent_at = NOW() WHERE id = $1`, [sourceUtxo.id]);
        console.log(`✅ Marked source UTXO as spent`);
        // Insert new UTXOs
        let insertedCount = 0;
        for (let vout = 0; vout < tx.outputs.length; vout++) {
            const output = tx.outputs[vout];
            if (output.satoshis === outputAmount) {
                await pool.query(`INSERT INTO utxos (txid, vout, satoshis, script_pub_key, address, purpose, status)
           VALUES ($1, $2, $3, $4, $5, 'publish', 'available')
           ON CONFLICT (txid, vout) DO NOTHING`, [
                    txid,
                    vout,
                    output.satoshis,
                    output.script.toHex(),
                    BSV_ADDRESS,
                ]);
                insertedCount++;
            }
            else if (output.satoshis > outputAmount) {
                // Change output
                await pool.query(`INSERT INTO utxos (txid, vout, satoshis, script_pub_key, address, purpose, status)
           VALUES ($1, $2, $3, $4, $5, 'publish', 'available')
           ON CONFLICT (txid, vout) DO NOTHING`, [
                    txid,
                    vout,
                    output.satoshis,
                    output.script.toHex(),
                    BSV_ADDRESS,
                ]);
            }
        }
        console.log(`✅ Inserted ${insertedCount} new 100-sat UTXOs`);
        if (changeAmount > 546) {
            console.log(`✅ Inserted 1 change UTXO (${changeAmount} sats)`);
        }
        // 6. Summary
        console.log(`\n${"=".repeat(50)}`);
        console.log(`✅ Split complete!`);
        console.log(`   Transaction: ${txid}`);
        console.log(`   New 100-sat UTXOs: ${insertedCount}`);
        console.log(`   Pool ready for publishing`);
        console.log(`${"=".repeat(50)}\n`);
        const poolStatus = await pool.query(`SELECT 
        COUNT(*) FILTER (WHERE satoshis = 100) as count_100sat,
        COUNT(*) as total_count,
        SUM(satoshis) as total_sats
       FROM utxos
       WHERE status = 'available' AND purpose = 'publish'`);
        const stats = poolStatus.rows[0];
        console.log(`Pool Status:`);
        console.log(`   100-sat UTXOs: ${stats.count_100sat}`);
        console.log(`   Total UTXOs: ${stats.total_count}`);
        console.log(`   Total Satoshis: ${stats.total_sats}`);
    }
    catch (error) {
        console.error("❌ Error:", error.message);
        if (error.response) {
            console.error("   Response:", JSON.stringify(error.response.data, null, 2));
        }
        process.exit(1);
    }
    finally {
        await pool.end();
    }
}
main();
