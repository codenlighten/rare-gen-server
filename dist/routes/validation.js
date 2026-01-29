"use strict";
/**
 * Signature verification middleware and validation logic
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePublishIntent = validatePublishIntent;
exports.recordNonceUsage = recordNonceUsage;
const ajv_1 = __importDefault(require("ajv"));
const signatures_1 = require("../crypto/signatures");
const db_1 = require("../db");
const ajv = new ajv_1.default();
// JSON Schema for PublishingRecord
const publishingRecordSchema = {
    type: "object",
    properties: {
        protocol: { type: "string", const: "sl-drm" },
        version: { type: "number", const: 1 },
        record: {
            type: "object",
            properties: {
                type: { type: "string", enum: ["music", "movie", "book", "document"] },
                assetId: { type: "string" },
                recordId: { type: "string" },
                event: {
                    type: "string",
                    enum: ["REGISTER", "UPDATE", "ASSIGN", "SPLIT_CHANGE"],
                },
                timestamp: { type: "string" },
                owners: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            partyId: { type: "string" },
                            role: { type: "string" },
                            shareBps: { type: "number" },
                        },
                        required: ["partyId", "role", "shareBps"],
                    },
                },
                distribution: {
                    type: "object",
                    properties: {
                        cdnUrl: { type: "string", nullable: true },
                        sha256: { type: "string", nullable: true },
                        contentType: { type: "string", nullable: true },
                    },
                },
                terms: {
                    type: "object",
                    properties: {
                        territory: { type: "string" },
                        rights: {
                            type: "array",
                            items: { type: "string" },
                        },
                        mechanical: { type: "boolean", nullable: true },
                    },
                    required: ["territory", "rights"],
                },
                nonce: { type: "string" },
            },
            required: [
                "type",
                "assetId",
                "recordId",
                "event",
                "timestamp",
                "owners",
                "distribution",
                "terms",
                "nonce",
            ],
        },
        signer: {
            type: "object",
            properties: {
                pubkey: { type: "string" },
                address: { type: "string", nullable: true },
            },
            required: ["pubkey"],
        },
        signature: {
            type: "object",
            properties: {
                alg: { type: "string" },
                hash: { type: "string" },
                sig: { type: "string" },
            },
            required: ["alg", "hash", "sig"],
        },
    },
    required: ["protocol", "version", "record", "signer", "signature"],
};
const validatePublishingRecord = ajv.compile(publishingRecordSchema);
/**
 * Validate PublishingRecord structure and signature
 */
async function validatePublishIntent(payload) {
    // 1. Validate schema
    if (!validatePublishingRecord(payload)) {
        return {
            valid: false,
            error: `Schema validation failed: ${ajv.errorsText(validatePublishingRecord.errors)}`,
        };
    }
    const pr = payload;
    // 2. Validate timestamp (not older than 10 minutes)
    const timestamp = new Date(pr.record.timestamp);
    const now = new Date();
    const ageMs = now.getTime() - timestamp.getTime();
    const maxAgeSec = 600; // 10 minutes
    if (ageMs > maxAgeSec * 1000) {
        return {
            valid: false,
            error: `Timestamp too old: ${Math.round(ageMs / 1000)}s (max ${maxAgeSec}s)`,
        };
    }
    // 3. Verify nonce not used
    const pubkeyHex = pr.signer.pubkey;
    const nonce = pr.record.nonce;
    try {
        const { rows } = await (0, db_1.getPool)().query("SELECT id FROM nonces WHERE pubkey_hex = $1 AND nonce = $2", [pubkeyHex, nonce]);
        if (rows.length > 0) {
            return {
                valid: false,
                error: "Nonce already used (replay attack detected)",
            };
        }
    }
    catch (err) {
        // Nonces table might not exist yet
        console.warn("Nonce check skipped:", err);
    }
    // 4. Verify signature
    // Canonical form of record (not the full wrapper)
    const recordCanonical = (0, signatures_1.canonicalizeJSON)(pr.record);
    const recordHash = (0, signatures_1.hashJSON)(pr.record);
    const sigValid = (0, signatures_1.verifySignature)(pubkeyHex, recordHash, pr.signature.sig);
    if (!sigValid) {
        return {
            valid: false,
            error: "Signature verification failed",
        };
    }
    // 5. Verify signer is registered
    try {
        const { rows } = await (0, db_1.getPool)().query("SELECT id FROM registered_keys WHERE pubkey_hex = $1 AND status = 'active'", [pubkeyHex]);
        if (rows.length === 0) {
            return {
                valid: false,
                error: "Signer not registered or revoked",
            };
        }
    }
    catch (err) {
        // Table might not exist yet
        console.warn("Signer check skipped:", err);
    }
    return {
        valid: true,
        record: pr.record,
        recordHash,
        pubkeyHex,
    };
}
/**
 * Record nonce usage
 */
async function recordNonceUsage(pubkeyHex, nonce, recordId) {
    try {
        await (0, db_1.getPool)().query(`INSERT INTO nonces (pubkey_hex, nonce, record_id, seen_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT DO NOTHING`, [pubkeyHex, nonce, recordId]);
    }
    catch (err) {
        console.warn("Failed to record nonce:", err);
    }
}
//# sourceMappingURL=validation.js.map