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
/**
 * Start batch worker
 */
export declare function startBatchWorker(): Promise<void>;
/**
 * Stop batch worker
 */
export declare function stopBatchWorker(): Promise<void>;
//# sourceMappingURL=batch-worker.d.ts.map