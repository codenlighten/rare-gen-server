"use strict";
/**
 * Fastify API server
 * Endpoints for signature verification, job submission, status queries
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startAPI = startAPI;
exports.stopAPI = stopAPI;
const fastify_1 = __importDefault(require("fastify"));
const db_1 = require("./db");
const validation_1 = require("./routes/validation");
const PORT = parseInt(process.env.PORT || "3000", 10);
const NODE_ENV = process.env.NODE_ENV || "development";
let server;
/**
 * Initialize Fastify server
 */
async function initServer() {
    const app = (0, fastify_1.default)({
        logger: {
            level: process.env.LOG_LEVEL || "info",
        },
    });
    // Initialize database
    await (0, db_1.initDb)();
    // Health check endpoint
    app.get("/health", async (req, res) => {
        const health = {
            ok: true,
            database: "connected",
            redis: "connected",
            timestamp: new Date().toISOString(),
        };
        try {
            await (0, db_1.getPool)().query("SELECT NOW()");
        }
        catch (err) {
            health.database = "disconnected";
            health.ok = false;
        }
        const statusCode = health.ok ? 200 : 503;
        res.status(statusCode).send(health);
    });
    // Version/info endpoint
    app.get("/info", async (req, res) => {
        res.send({
            name: "RareGen Publisher Container A",
            version: "2.0.0",
            environment: NODE_ENV,
            features: {
                signedPublishing: true,
                utxoPooling: true,
                batchPublishing: false, // Phase 2
                ordinals: false, // Phase 2
            },
        });
    });
    /**
     * POST /v1/publish
     * Submit a signed publishing intent
     *
     * Request body: raw JSON serialized PublishingRecord
     *
     * Response:
     * {
     *   "ok": true,
     *   "recordId": "REC_...",
     *   "hash": "sha256...",
     *   "jobId": "job_...",
     *   "status": "queued"
     * }
     */
    app.post("/v1/publish", async (req, res) => {
        const payload = req.body;
        try {
            // 1. Validate publishing intent
            const validation = await (0, validation_1.validatePublishIntent)(payload);
            if (!validation.valid) {
                res.status(400).send({
                    ok: false,
                    error: validation.error,
                });
                return;
            }
            const { record, recordHash, pubkeyHex } = validation;
            if (!record || !recordHash || !pubkeyHex) {
                res.status(400).send({
                    ok: false,
                    error: "Invalid validation result",
                });
                return;
            }
            // 2. Record nonce usage
            await (0, validation_1.recordNonceUsage)(pubkeyHex, record.nonce, record.recordId);
            // 3. Create publish job
            const jobId = await (0, db_1.createPublishJob)(record.recordId, JSON.stringify(record), recordHash, record.distribution.cdnUrl, record.distribution.sha256);
            // 4. TODO: Enqueue job to BullMQ
            // await publishQueue.add("publish", { jobId }, { jobId });
            // 5. Audit log
            try {
                await (0, db_1.getPool)().query(`INSERT INTO audit_log (event_type, actor_pubkey, resource_type, resource_id, action, details)
           VALUES ('PUBLISH_INTENT', $1, 'publish_job', $2, 'submit', $3)`, [pubkeyHex, jobId, JSON.stringify({ recordId: record.recordId })]);
            }
            catch (err) {
                console.warn("Audit log failed:", err);
            }
            res.status(202).send({
                ok: true,
                recordId: record.recordId,
                hash: recordHash,
                jobId,
                status: "queued",
            });
        }
        catch (error) {
            console.error("Publish endpoint error:", error);
            res.status(500).send({
                ok: false,
                error: "Internal server error",
            });
        }
    });
    /**
     * GET /v1/job/:jobId
     * Check job status
     */
    app.get("/v1/job/:jobId", async (req, res) => {
        const jobId = req.params.jobId;
        try {
            const result = await (0, db_1.getPool)().query(`SELECT job_id, record_id, status, txid, error_code, error_detail, created_at, sent_at, confirmed_at
           FROM publish_jobs
           WHERE job_id = $1`, [jobId]);
            if (result.rows.length === 0) {
                res.status(404).send({
                    ok: false,
                    error: "Job not found",
                });
                return;
            }
            const job = result.rows[0];
            res.send({
                ok: true,
                jobId: job.job_id,
                recordId: job.record_id,
                status: job.status,
                txid: job.txid,
                errorCode: job.error_code,
                errorDetail: job.error_detail,
                timestamps: {
                    createdAt: job.created_at,
                    sentAt: job.sent_at,
                    confirmedAt: job.confirmed_at,
                },
            });
        }
        catch (error) {
            console.error("Job status endpoint error:", error);
            res.status(500).send({
                ok: false,
                error: "Internal server error",
            });
        }
    });
    /**
     * GET /v1/record/:recordId
     * Retrieve published record metadata
     */
    app.get("/v1/record/:recordId", async (req, res) => {
        const recordId = req.params.recordId;
        try {
            const result = await (0, db_1.getPool)().query(`SELECT record_id, record_canonical, record_hash, status, txid, created_at
           FROM publish_jobs
           WHERE record_id = $1
           ORDER BY created_at DESC
           LIMIT 1`, [recordId]);
            if (result.rows.length === 0) {
                res.status(404).send({
                    ok: false,
                    error: "Record not found",
                });
                return;
            }
            const job = result.rows[0];
            res.send({
                ok: true,
                recordId: job.record_id,
                recordHash: job.record_hash,
                status: job.status,
                txid: job.txid,
                createdAt: job.created_at,
                record: JSON.parse(job.record_canonical),
            });
        }
        catch (error) {
            console.error("Record endpoint error:", error);
            res.status(500).send({
                ok: false,
                error: "Internal server error",
            });
        }
    });
    return app;
}
/**
 * Start the API server
 */
async function startAPI() {
    try {
        server = await initServer();
        await server.listen({ port: PORT, host: "0.0.0.0" });
        console.log("========================================");
        console.log("RareGen Publisher Container A");
        console.log("========================================");
        console.log(`✓ API listening on http://0.0.0.0:${PORT}`);
        console.log(`  /health - Health check`);
        console.log(`  /info - Server info`);
        console.log(`  POST /v1/publish - Submit signed publishing intent`);
        console.log(`  GET /v1/job/:jobId - Check job status`);
        console.log(`  GET /v1/record/:recordId - Retrieve record metadata`);
        console.log("========================================\n");
    }
    catch (error) {
        console.error("Failed to start API:", error);
        process.exit(1);
    }
}
/**
 * Graceful shutdown
 */
async function stopAPI() {
    if (server) {
        await server.close();
    }
}
// Main entry point
if (require.main === module) {
    startAPI().catch((err) => {
        console.error("Startup failed:", err);
        process.exit(1);
    });
    process.on("SIGTERM", async () => {
        console.log("SIGTERM received, shutting down...");
        await stopAPI();
        process.exit(0);
    });
    process.on("SIGINT", async () => {
        console.log("SIGINT received, shutting down...");
        await stopAPI();
        process.exit(0);
    });
}
//# sourceMappingURL=api.js.map