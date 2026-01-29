/**
 * BullMQ-based worker for processing publish jobs
 * Consumes jobs from queue, locks UTXOs, builds OP_RETURN tx, broadcasts to BSV
 */

import { Queue, Worker } from "bullmq";
import { createClient } from "redis";
import { initDb, getPool } from "./db";
import bsv from "@smartledger/bsv";
import axios from "axios";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const EXPLORER_BASE = process.env.EXPLORER_BASE_URL || "https://explorer.codenlighten.org";
const BSV_PRIVATE_KEY = process.env.BSV_PRIVATE_KEY;
const BSV_ADDRESS = process.env.BSV_ADDRESS;
const FEE_SAT_PER_KB = parseInt(process.env.FEE_SATS_PER_KB || "100", 10);

let publishQueue: Queue;
let worker: Worker;

/**
 * Initialize Redis and BullMQ
 */
async function initQueue(): Promise<void> {
  const connection = {
    url: REDIS_URL,
  };
  
  publishQueue = new Queue("publish_jobs", {
    connection: connection as any,
  });

  // Initialize database
  await initDb();

  console.log("✓ Queue initialized");
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

  // Add input
  tx.from({
    txid: utxo.txid,
    outputIndex: utxo.vout,
    script: bsv.Script.fromHex(utxo.script_pub_key),
    satoshis: utxo.satoshis,
  });

  // Add OP_RETURN output with compact payload
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

  // Add change
  tx.change(changeAddress).feePerKb(FEE_SAT_PER_KB * 1000); // Convert sat/byte to sat/KB

  // Sign
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
 * Reserve UTXO atomically
 */
async function reserveUTXO(): Promise<{
  id: number;
  txid: string;
  vout: number;
  satoshis: number;
  script_pub_key: string;
} | null> {
  const result = await getPool().query(
    `UPDATE utxos
     SET status = 'reserved', reserved_at = NOW()
     WHERE id = (
       SELECT id FROM utxos
       WHERE purpose = 'publish' AND status = 'available'
       ORDER BY created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, txid, vout, satoshis, script_pub_key`
  );

  return result.rows[0] || null;
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
 * Process a publish job
 */
async function processJob(
  jobData: { jobId: string; recordId: string; recordHash: string },
): Promise<string> {
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
    const { txHex, txSize, fee } = buildPublishTx(utxo, recordHash, BSV_ADDRESS!);
    console.log(`[Worker] Built TX (${txSize} bytes, ${fee} sats fee)`);

    // 3. Broadcast
    const txid = await broadcastTx(txHex);
    console.log(`[Worker] Broadcast successful: ${txid}`);

    // 4. Update publish job
    await getPool().query(
      `UPDATE publish_jobs
       SET status = 'sent', txid = $1, sent_at = NOW(), updated_at = NOW()
       WHERE job_id = $2`,
      [txid, jobId]
    );

    // 5. Mark UTXO as spent
    await markUTXOSpent(utxo.id, txid);

    return txid;
  } catch (error) {
    console.error(`[Worker] Error processing job ${jobId}:`, error);

    // Release UTXO reservation
    await getPool().query(`UPDATE utxos SET status = 'available' WHERE id = $1`, [utxo.id]);

    throw error;
  }
}

/**
 * Start the worker
 */
export async function startWorker(): Promise<void> {
  await initQueue();

  worker = new Worker(
    "publish_jobs",
    async (job) => {
      const { jobId, recordId, recordHash } = job.data;

      try {
        const txid = await processJob({ jobId, recordId, recordHash });
        return { ok: true, txid };
      } catch (error) {
        console.error(`Worker job failed: ${error}`);
        throw error;
      }
    },
    {
      connection: { url: REDIS_URL } as any,
      concurrency: 1, // Process one job at a time
    }
  );

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
export async function stopWorker(): Promise<void> {
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
