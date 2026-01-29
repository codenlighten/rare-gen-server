/**
 * BullMQ-based worker for processing publish jobs
 * Consumes jobs from queue, locks UTXOs, builds OP_RETURN tx, broadcasts to BSV
 */
/**
 * Start the worker
 */
export declare function startWorker(): Promise<void>;
/**
 * Graceful shutdown
 */
export declare function stopWorker(): Promise<void>;
//# sourceMappingURL=worker.d.ts.map