"use strict";
/**
 * BullMQ-based worker for processing publish jobs
 * Consumes jobs from queue, locks UTXOs, builds OP_RETURN tx, broadcasts to BSV
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startWorker = startWorker;
exports.stopWorker = stopWorker;
const bullmq_1 = require("bullmq");
const db_1 = require("./db");
const bsv_1 = __importDefault(require("@smartledger/bsv"));
const axios_1 = __importDefault(require("axios"));
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const EXPLORER_BASE = process.env.EXPLORER_BASE_URL || "https://explorer.codenlighten.org";
const BSV_PRIVATE_KEY = process.env.BSV_PRIVATE_KEY;
const BSV_ADDRESS = process.env.BSV_ADDRESS;
const FEE_SAT_PER_KB = parseInt(process.env.FEE_SATS_PER_KB || "100", 10);
let publishQueue;
let worker;
/**
 * Initialize Redis and BullMQ
 */
async function initQueue() {
    const connection = {
        url: REDIS_URL,
    };
    publishQueue = new bullmq_1.Queue("publish_jobs", {
        connection: connection,
    });
    // Initialize database
    await (0, db_1.initDb)();
    console.log("✓ Queue initialized");
}
/**
 * Build OP_RETURN transaction
 */
function buildPublishTx(utxo, recordHash, changeAddress) {
    const tx = new bsv_1.default.Transaction();
    // Add input
    tx.from({
        txid: utxo.txid,
        outputIndex: utxo.vout,
        script: bsv_1.default.Script.fromHex(utxo.script_pub_key),
        satoshis: utxo.satoshis,
    });
    // Add OP_RETURN output with compact payload
    const payload = {
        p: "sl-drm",
        v: 1,
        hash: recordHash,
    };
    const payloadHex = Buffer.from(JSON.stringify(payload)).toString("hex");
    tx.addOutput(new bsv_1.default.Transaction.Output({
        script: bsv_1.default.Script.buildSafeDataOut(Buffer.from(payloadHex, "hex")),
        satoshis: 0,
    }));
    // Add change
    tx.change(changeAddress).feePerKb(FEE_SAT_PER_KB * 1000); // Convert sat/byte to sat/KB
    // Sign
    const privkey = bsv_1.default.PrivateKey.fromWIF(BSV_PRIVATE_KEY);
    tx.sign(privkey);
    return {
        txHex: tx.toString("hex"),
        txSize: tx.size || 200,
        fee: Math.ceil((tx.size || 200) * (FEE_SAT_PER_KB / 1000)),
    };
}
/**
 * Broadcast transaction to explorer
 */
async function broadcastTx(txHex) {
    const response = await axios_1.default.post(`${EXPLORER_BASE}/api/bsv/main/tx/broadcast`, {
        txHex,
    });
    const txid = response.data.data?.txid || response.data.data;
    if (!txid) {
        throw new Error("No TXID in broadcast response");
    }
    return txid;
}
/**
 * Reserve UTXO atomically with timeout
 */
async function reserveUTXO() {
    // First, release any expired reservations
    await (0, db_1.getPool)().query(`UPDATE utxos
     SET status = 'available', reserved_at = NULL, reserved_until = NULL
     WHERE status = 'reserved' 
     AND reserved_until < NOW()`);
    // Reserve a UTXO with 5-minute timeout
    const result = await (0, db_1.getPool)().query(`UPDATE utxos
     SET status = 'reserved', 
         reserved_at = NOW(), 
         reserved_until = NOW() + INTERVAL '5 minutes'
     WHERE id = (
       SELECT id FROM utxos
       WHERE purpose = 'publish' 
       AND status = 'available'
       AND (dirty = FALSE OR dirty IS NULL)
       ORDER BY satoshis ASC, created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, txid, vout, satoshis, script_pub_key`);
    return result.rows[0] || null;
}
/**
 * Mark UTXO as spent
 */
async function markUTXOSpent(utxoId, txid) {
    await (0, db_1.getPool)().query(`UPDATE utxos
     SET status = 'spent', spent_at = NOW(), spent_by_txid = $2
     WHERE id = $1`, [utxoId, txid]);
}
/**
 * Mark UTXO as dirty (mempool conflict)
 */
async function markUTXODirty(utxoId, reason) {
    await (0, db_1.getPool)().query(`UPDATE utxos
     SET dirty = TRUE, status = 'available', reserved_at = NULL, reserved_until = NULL
     WHERE id = $1`, [utxoId]);
    console.log(`[Worker] Marked UTXO ${utxoId} as dirty: ${reason}`);
}
/**
 * Release UTXO reservation on error
 */
async function releaseUTXO(utxoId) {
    await (0, db_1.getPool)().query(`UPDATE utxos 
     SET status = 'available', reserved_at = NULL, reserved_until = NULL 
     WHERE id = $1`, [utxoId]);
}
/**
 * Process a publish job
 */
async function processJob(jobData) {
    const { jobId, recordId, recordHash } = jobData;
    console.log(`[Worker] Processing job ${jobId} for record ${recordId}`);
    // 1. Reserve UTXO
    const utxo = await reserveUTXO();
    if (!utxo) {
        throw new Error("No available UTXOs in pool");
    }
    console.log(`[Worker] Reserved UTXO: ${utxo.txid}:${utxo.vout}`);
    try {
        // 2. Build transaction
        const { txHex, txSize, fee } = buildPublishTx(utxo, recordHash, BSV_ADDRESS);
        console.log(`[Worker] Built TX (${txSize} bytes, ${fee} sats fee)`);
        // 3. Broadcast
        const txid = await broadcastTx(txHex);
        console.log(`[Worker] Broadcast successful: ${txid}`);
        // 4. Update publish job
        await (0, db_1.getPool)().query(`UPDATE publish_jobs
       SET status = 'sent', txid = $1, sent_at = NOW()
       WHERE job_id = $2`, [txid, jobId]);
        // 5. Mark UTXO as spent
        await markUTXOSpent(utxo.id, txid);
        return txid;
    }
    catch (error) {
        console.error(`[Worker] Error processing job ${jobId}:`, error);
        // Handle mempool conflicts
        if (error.message && error.message.includes("mempool")) {
            await markUTXODirty(utxo.id, error.message);
        }
        else {
            // Release UTXO reservation for other errors
            await releaseUTXO(utxo.id);
        }
        // Update job status to failed
        await (0, db_1.getPool)().query(`UPDATE publish_jobs
       SET status = 'failed', error_code = $1, error_detail = $2
       WHERE job_id = $3`, ["BROADCAST_ERROR", error.message, jobId]);
        throw error;
    }
}
/**
 * Start the worker
 */
async function startWorker() {
    await initQueue();
    worker = new bullmq_1.Worker("publish_jobs", async (job) => {
        const { jobId, recordId, recordHash } = job.data;
        try {
            const txid = await processJob({ jobId, recordId, recordHash });
            return { ok: true, txid };
        }
        catch (error) {
            console.error(`Worker job failed: ${error}`);
            throw error;
        }
    }, {
        connection: { url: REDIS_URL },
        concurrency: 1, // Process one job at a time
    });
    worker.on("completed", (job) => {
        console.log(`✓ Job ${job.id} completed`);
    });
    worker.on("failed", (job, error) => {
        console.error(`✗ Job ${job?.id} failed:`, error?.message);
    });
    console.log("========================================");
    console.log("RareGen Publisher Worker");
    console.log("========================================");
    console.log("✓ Worker started, listening on queue: publish_jobs");
    console.log("========================================\n");
}
/**
 * Graceful shutdown
 */
async function stopWorker() {
    if (worker) {
        await worker.close();
    }
    if (publishQueue) {
        await publishQueue.close();
    }
}
// Main entry point
if (require.main === module) {
    startWorker().catch((err) => {
        console.error("Worker startup failed:", err);
        process.exit(1);
    });
    process.on("SIGTERM", async () => {
        console.log("SIGTERM received, shutting down...");
        await stopWorker();
        process.exit(0);
    });
    process.on("SIGINT", async () => {
        console.log("SIGINT received, shutting down...");
        await stopWorker();
        process.exit(0);
    });
}
//# sourceMappingURL=worker.js.map