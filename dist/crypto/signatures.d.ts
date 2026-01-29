/**
 * Cryptographic utilities: JCS canonicalization, ECDSA verification, hash computation
 */
/**
 * Canonicalize JSON object to deterministic string (RFC 8785 JCS)
 * Uses stable key sorting and normalized number/string representation
 */
export declare function canonicalizeJSON(obj: unknown): string;
/**
 * Compute SHA256 hash of data
 */
export declare function sha256(data: Buffer | string): string;
/**
 * Hash a JSON object deterministically
 */
export declare function hashJSON(obj: unknown): string;
/**
 * Verify ECDSA signature using BSV PrivateKey/PublicKey
 *
 * @param pubkeyHex - compressed public key (hex string)
 * @param messageHash - SHA256 hash (hex string, 64 chars)
 * @param signatureBase64 - DER-encoded signature (base64)
 * @returns true if signature is valid
 */
export declare function verifySignature(pubkeyHex: string, messageHash: string, signatureBase64: string): boolean;
/**
 * Sign a message (or hash) with a private key
 * Used for testing/demo purposes
 */
export declare function signData(privateKeyWIF: string, data: Buffer | string): string;
/**
 * Derive address from public key
 */
export declare function pubkeyToAddress(pubkeyHex: string): string;
//# sourceMappingURL=signatures.d.ts.map