/**
 * Batch Worker - High-throughput publisher with rate limiting
 * 
 * Architecture:
 * - Collector loop (5s window): claims up to MAX_BATCH_SIZE queued jobs
 * - Broadcaster loop (continuous): processes batches with token bucket rate limiting
 * 
 * Rate limit: 500 tx per 3 seconds (configurable)
 * State machine: queued → processing_batch → sending → sent/failed
 */

import { initDb, getPool } from "./db";
import bsv from "@smartledger/bsv";
import axios from "axios";
import { TokenBucket } from "./token-bucket";

const EXPLORER_BASE = process.env.EXPLORER_BASE_URL || "https://explorer.codenlighten.org";
const BSV_PRIVATE_KEY = process.env.BSV_PRIVATE_KEY;
const BSV_ADDRESS = process.env.BSV_ADDRESS;
const FEE_SAT_PER_KB = parseInt(process.env.FEE_SATS_PER_KB || "100", 10);

// Batch configuration
const BATCH_WINDOW_MS = parseInt(process.env.BATCH_WINDOW_MS || "5000", 10);
const MAX_BATCH_SIZE = parseInt(process.env.MAX_BATCH_SIZE || "500", 10);
const MAX_TX_PER_3S = parseInt(process.env.MAX_TX_PER_3S || "500", 10);

// Token bucket: MAX_TX_PER_3S tokens per 3000ms
const rateLimiter = new TokenBucket(MAX_TX_PER_3S, MAX_TX_PER_3S / 3000);

let collectorInterval: NodeJS.Timeout | null = null;
let broadcasterRunning = false;

/**
 * Generate unique batch ID
 */
function generateBatchId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `batch_${timestamp}_${random}`;
}

/**
 * Collector: Claim up to MAX_BATCH_SIZE queued jobs into a batch
 * Runs every BATCH_WINDOW_MS (default: 5 seconds)
 */
async function collectBatch(): Promise<void> {
  const batchId = generateBatchId();
  
  try {
    const result = await getPool().query(
      `WITH to_claim AS (
        SELECT id
        FROM publish_jobs
        WHERE status = 'queued'
        ORDER BY created_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      ),
      numbered AS (
        SELECT id, row_number() OVER (ORDER BY id) AS seq
        FROM to_claim
      )
      UPDATE publish_jobs pj
      SET
        status = 'processing_batch',
        processing_batch_id = $1,
        batch_seq = numbered.seq
      FROM numbered
      WHERE pj.id = numbered.id
      RETURNING
        pj.id, pj.job_id, pj.record_hash, pj.processing_batch_id, pj.batch_seq, pj.created_at`,
      [batchId, MAX_BATCH_SIZE]
    );

    if (result.rows.length > 0) {
      console.log(`[Collector] Created batch ${batchId} with ${result.rows.length} jobs`);
    }
  } catch (error) {
    console.error(`[Collector] Error creating batch:`, error);
  }
}

/**
 * Get oldest active batch ID
 */
async function getActiveBatch(): Promise<string | null> {
  const result = await getPool().query(
    `SELECT processing_batch_id
     FROM publish_jobs
     WHERE status IN ('processing_batch', 'sending')
       AND processing_batch_id IS NOT NULL
     GROUP BY processing_batch_id
     ORDER BY MIN(created_at) ASC
     LIMIT 1`
  );

  return result.rows[0]?.processing_batch_id || null;
}

/**
 * Claim next job from batch (processing_batch → sending)
 */
async function claimNextJob(batchId: string): Promise<{
  id: number;
  job_id: string;
  record_hash: string;
  batch_seq: number;
} | null> {
  const result = await getPool().query(
    `WITH next_job AS (
      SELECT id
      FROM publish_jobs
      WHERE processing_batch_id = $1
        AND status = 'processing_batch'
      ORDER BY batch_seq ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE publish_jobs pj
    SET status = 'sending', sending_started_at = NOW()
    FROM next_job
    WHERE pj.id = next_job.id
    RETURNING pj.id, pj.job_id, pj.record_hash, pj.batch_seq`,
    [batchId]
  );

  return result.rows[0] || null;
}

/**
 * Reserve UTXO atomically with timeout
 */
async function reserveUTXO(): Promise<{
  id: number;
  txid: string;
  vout: number;
  satoshis: number;
  script_pub_key: string;
} | null> {
  // Release expired reservations
  await getPool().query(
    `UPDATE utxos
     SET status = 'available', reserved_at = NULL, reserved_until = NULL
     WHERE status = 'reserved' 
     AND reserved_until < NOW()`
  );

  // Reserve UTXO with 5-minute timeout
  const result = await getPool().query(
    `UPDATE utxos
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
     RETURNING id, txid, vout, satoshis, script_pub_key`
  );

  return result.rows[0] || null;
}

/**
 * Build OP_RETURN transaction
 */
function buildPublishTx(
  utxo: {
    txid: string;
    vout: number;
    satoshis: number;
    script_pub_key: string;
  },
  recordHash: string,
  changeAddress: string
): {
  txHex: string;
  txSize: number;
  fee: number;
} {
  const tx = new bsv.Transaction();

  tx.from({
    txid: utxo.txid,
    outputIndex: utxo.vout,
    script: bsv.Script.fromHex(utxo.script_pub_key),
    satoshis: utxo.satoshis,
  });

  const payload = {
    p: "sl-drm",
    v: 1,
    hash: recordHash,
  };
  const payloadHex = Buffer.from(JSON.stringify(payload)).toString("hex");

  tx.addOutput(
    new bsv.Transaction.Output({
      script: bsv.Script.buildSafeDataOut(Buffer.from(payloadHex, "hex")),
      satoshis: 0,
    })
  );

  tx.change(changeAddress).feePerKb(FEE_SAT_PER_KB * 1000);

  const privkey = bsv.PrivateKey.fromWIF(BSV_PRIVATE_KEY!);
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
async function broadcastTx(txHex: string): Promise<string> {
  const response = await axios.post(`${EXPLORER_BASE}/api/bsv/main/tx/broadcast`, {
    txHex,
  });

  const txid = response.data.data?.txid || response.data.data;
  if (!txid) {
    throw new Error("No TXID in broadcast response");
  }

  return txid;
}

/**
 * Mark UTXO as spent
 */
async function markUTXOSpent(utxoId: number, txid: string): Promise<void> {
  await getPool().query(
    `UPDATE utxos
     SET status = 'spent', spent_at = NOW(), spent_by_txid = $2
     WHERE id = $1`,
    [utxoId, txid]
  );
}

/**
 * Mark UTXO as dirty (mempool conflict)
 */
async function markUTXODirty(utxoId: number, reason: string): Promise<void> {
  await getPool().query(
    `UPDATE utxos
     SET dirty = TRUE, status = 'available', reserved_at = NULL, reserved_until = NULL
     WHERE id = $1`,
    [utxoId]
  );
  console.log(`[Batch] Marked UTXO ${utxoId} as dirty: ${reason}`);
}

/**
 * Release UTXO reservation on error
 */
async function releaseUTXO(utxoId: number): Promise<void> {
  await getPool().query(
    `UPDATE utxos 
     SET status = 'available', reserved_at = NULL, reserved_until = NULL 
     WHERE id = $1`,
    [utxoId]
  );
}

/**
 * Process one job: reserve UTXO, build tx, broadcast, update state
 */
async function processJob(job: {
  id: number;
  job_id: string;
  record_hash: string;
  batch_seq: number;
}): Promise<void> {
  // 1. Reserve UTXO
  const utxo = await reserveUTXO();
  if (!utxo) {
    throw new Error("No available UTXOs in pool");
  }

  try {
    // 2. Build transaction
    const { txHex } = buildPublishTx(utxo, job.record_hash, BSV_ADDRESS!);

    // 3. Apply rate limit BEFORE broadcast
    await rateLimiter.take(1);

    // 4. Broadcast
    const txid = await broadcastTx(txHex);

    // 5. Update job as sent
    await getPool().query(
      `UPDATE publish_jobs
       SET status = 'sent', txid = $1, sent_at = NOW()
       WHERE id = $2`,
      [txid, job.id]
    );

    // 6. Mark UTXO as spent
    await markUTXOSpent(utxo.id, txid);

    console.log(`[Batch] ✓ Job ${job.job_id} (seq ${job.batch_seq}) → ${txid}`);
  } catch (error: any) {
    console.error(`[Batch] ✗ Job ${job.job_id} failed:`, error.message);

    // Handle mempool conflicts
    if (error.message && error.message.includes("mempool")) {
      await markUTXODirty(utxo.id, error.message);
    } else {
      await releaseUTXO(utxo.id);
    }

    // Update job as failed
    await getPool().query(
      `UPDATE publish_jobs
       SET status = 'failed', error_code = $1, error_detail = $2
       WHERE id = $3`,
      ["BROADCAST_ERROR", error.message, job.id]
    );
  }
}

/**
 * Broadcaster: Continuously process batches with rate limiting
 */
async function broadcasterLoop(): Promise<void> {
  broadcasterRunning = true;

  while (broadcasterRunning) {
    try {
      // Get oldest active batch
      const batchId = await getActiveBatch();
      
      if (!batchId) {
        // No active batches, wait briefly
        await new Promise(r => setTimeout(r, 500));
        continue;
      }

      // Process batch job by job
      while (broadcasterRunning) {
        const job = await claimNextJob(batchId);
        
        if (!job) {
          // Batch drained
          console.log(`[Batch] Completed batch ${batchId}`);
          break;
        }

        await processJob(job);
      }
    } catch (error) {
      console.error(`[Batch] Broadcaster error:`, error);
      await new Promise(r => setTimeout(r, 1000)); // Brief pause on error
    }
  }
}

/**
 * Unstick jobs that are stuck in 'sending' state
 * (worker died mid-broadcast)
 */
async function unstickJobs(): Promise<void> {
  const TTL_MINUTES = 2;
  
  const result = await getPool().query(
    `UPDATE publish_jobs
     SET status = 'processing_batch', sending_started_at = NULL
     WHERE status = 'sending'
       AND sending_started_at < NOW() - INTERVAL '${TTL_MINUTES} minutes'
     RETURNING job_id`,
  );

  if (result.rows.length > 0) {
    console.log(`[Batch] Unstuck ${result.rows.length} jobs from 'sending' state`);
  }
}

/**
 * Start batch worker
 */
export async function startBatchWorker(): Promise<void> {
  await initDb();

  console.log("========================================");
  console.log("RareGen Batch Publisher Worker");
  console.log("========================================");
  console.log(`Batch window: ${BATCH_WINDOW_MS}ms`);
  console.log(`Max batch size: ${MAX_BATCH_SIZE}`);
  console.log(`Rate limit: ${MAX_TX_PER_3S} tx per 3 seconds`);
  console.log("========================================\n");

  // Unstick any jobs from previous crashes
  await unstickJobs();

  // Start collector loop (every BATCH_WINDOW_MS)
  collectorInterval = setInterval(async () => {
    try {
      await collectBatch();
    } catch (error) {
      console.error("[Collector] Error:", error);
    }
  }, BATCH_WINDOW_MS);

  // Start broadcaster loop (continuous)
  broadcasterLoop().catch((error) => {
    console.error("[Batch] Broadcaster crashed:", error);
    process.exit(1);
  });

  console.log("✓ Batch worker started");
  console.log("✓ Collector running (5s window)");
  console.log("✓ Broadcaster running (rate limited)\n");
}

/**
 * Stop batch worker
 */
export async function stopBatchWorker(): Promise<void> {
  if (collectorInterval) {
    clearInterval(collectorInterval);
    collectorInterval = null;
  }
  
  broadcasterRunning = false;
  console.log("✓ Batch worker stopped");
}

// Main entry point
if (require.main === module) {
  startBatchWorker().catch((err) => {
    console.error("Batch worker startup failed:", err);
    process.exit(1);
  });

  process.on("SIGTERM", async () => {
    console.log("SIGTERM received, shutting down...");
    await stopBatchWorker();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    console.log("SIGINT received, shutting down...");
    await stopBatchWorker();
    process.exit(0);
  });
}
