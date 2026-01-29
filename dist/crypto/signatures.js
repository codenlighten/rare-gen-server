"use strict";
/**
 * Cryptographic utilities: JCS canonicalization, ECDSA verification, hash computation
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalizeJSON = canonicalizeJSON;
exports.sha256 = sha256;
exports.hashJSON = hashJSON;
exports.verifySignature = verifySignature;
exports.signData = signData;
exports.pubkeyToAddress = pubkeyToAddress;
const crypto_1 = __importDefault(require("crypto"));
const bsv_1 = __importDefault(require("@smartledger/bsv"));
/**
 * Canonicalize JSON object to deterministic string (RFC 8785 JCS)
 * Uses stable key sorting and normalized number/string representation
 */
function canonicalizeJSON(obj) {
    return JSON.stringify(sortKeys(obj));
}
function sortKeys(obj) {
    if (obj === null || obj === undefined) {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(sortKeys);
    }
    if (typeof obj === "object") {
        const sorted = {};
        Object.keys(obj)
            .sort()
            .forEach((key) => {
            sorted[key] = sortKeys(obj[key]);
        });
        return sorted;
    }
    return obj;
}
/**
 * Compute SHA256 hash of data
 */
function sha256(data) {
    const buf = typeof data === "string" ? Buffer.from(data, "utf-8") : data;
    return crypto_1.default.createHash("sha256").update(buf).digest("hex");
}
/**
 * Hash a JSON object deterministically
 */
function hashJSON(obj) {
    const canonical = canonicalizeJSON(obj);
    return sha256(canonical);
}
/**
 * Verify ECDSA signature using BSV PrivateKey/PublicKey
 *
 * @param pubkeyHex - compressed public key (hex string)
 * @param messageHash - SHA256 hash (hex string, 64 chars)
 * @param signatureBase64 - DER-encoded signature (base64)
 * @returns true if signature is valid
 */
function verifySignature(pubkeyHex, messageHash, signatureBase64) {
    try {
        // Parse public key
        const pubkey = bsv_1.default.PublicKey.fromString(pubkeyHex, "hex");
        // Parse signature from base64 → Buffer
        const sigBuffer = Buffer.from(signatureBase64, "base64");
        // Create message (32-byte hash)
        const hashBuffer = Buffer.from(messageHash, "hex");
        // Verify using BSV ECDSA
        // Note: bsv uses ECDSA verification internally
        // We manually check using the signature verification
        const ecdsa = bsv_1.default.crypto.ECDSA;
        const sig = bsv_1.default.crypto.Signature.fromBuffer(sigBuffer);
        // Use BSV's built-in verification
        return ecdsa.verify(hashBuffer, sig, pubkey);
    }
    catch (error) {
        console.error("Signature verification failed:", error);
        return false;
    }
}
/**
 * Sign a message (or hash) with a private key
 * Used for testing/demo purposes
 */
function signData(privateKeyWIF, data) {
    try {
        const privkey = bsv_1.default.PrivateKey.fromWIF(privateKeyWIF);
        const dataBuffer = typeof data === "string" ? Buffer.from(data, "utf-8") : data;
        // Hash the data
        const dataHash = crypto_1.default.createHash("sha256").update(dataBuffer).digest();
        // Sign
        const sig = bsv_1.default.crypto.ECDSA.sign(dataHash, privkey);
        const sigBuffer = sig.toBuffer();
        // Return base64
        return sigBuffer.toString("base64");
    }
    catch (error) {
        console.error("Signing failed:", error);
        throw error;
    }
}
/**
 * Derive address from public key
 */
function pubkeyToAddress(pubkeyHex) {
    try {
        const pubkey = bsv_1.default.PublicKey.fromString(pubkeyHex, "hex");
        const address = bsv_1.default.Address.fromPublicKey(pubkey);
        return address.toString();
    }
    catch (error) {
        console.error("Address derivation failed:", error);
        throw error;
    }
}
//# sourceMappingURL=signatures.js.map