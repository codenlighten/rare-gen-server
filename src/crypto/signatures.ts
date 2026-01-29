/**
 * Cryptographic utilities: JCS canonicalization, ECDSA verification, hash computation
 */

import crypto from "crypto";
import bsv from "@smartledger/bsv";

/**
 * Canonicalize JSON object to deterministic string (RFC 8785 JCS)
 * Uses stable key sorting and normalized number/string representation
 */
export function canonicalizeJSON(obj: unknown): string {
  return JSON.stringify(sortKeys(obj));
}

function sortKeys(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sortKeys);
  }

  if (typeof obj === "object") {
    const sorted: Record<string, unknown> = {};
    Object.keys(obj)
      .sort()
      .forEach((key) => {
        sorted[key] = sortKeys((obj as Record<string, unknown>)[key]);
      });
    return sorted;
  }

  return obj;
}

/**
 * Compute SHA256 hash of data
 */
export function sha256(data: Buffer | string): string {
  const buf = typeof data === "string" ? Buffer.from(data, "utf-8") : data;
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/**
 * Hash a JSON object deterministically
 */
export function hashJSON(obj: unknown): string {
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
export function verifySignature(
  pubkeyHex: string,
  messageHash: string,
  signatureBase64: string
): boolean {
  try {
    // Parse public key
    const pubkey = bsv.PublicKey.fromString(pubkeyHex, "hex");

    // Parse signature from base64 → Buffer
    const sigBuffer = Buffer.from(signatureBase64, "base64");

    // Create message (32-byte hash)
    const hashBuffer = Buffer.from(messageHash, "hex");

    // Verify using BSV ECDSA
    // Note: bsv uses ECDSA verification internally
    // We manually check using the signature verification
    const ecdsa = bsv.crypto.ECDSA;
    const sig = bsv.crypto.Signature.fromBuffer(sigBuffer);

    // Use BSV's built-in verification
    return ecdsa.verify(hashBuffer, sig, pubkey);
  } catch (error) {
    console.error("Signature verification failed:", error);
    return false;
  }
}

/**
 * Sign a message (or hash) with a private key
 * Used for testing/demo purposes
 */
export function signData(privateKeyWIF: string, data: Buffer | string): string {
  try {
    const privkey = bsv.PrivateKey.fromWIF(privateKeyWIF);
    const dataBuffer = typeof data === "string" ? Buffer.from(data, "utf-8") : data;

    // Hash the data
    const dataHash = crypto.createHash("sha256").update(dataBuffer).digest();

    // Sign
    const sig = bsv.crypto.ECDSA.sign(dataHash, privkey);
    const sigBuffer = sig.toBuffer();

    // Return base64
    return sigBuffer.toString("base64");
  } catch (error) {
    console.error("Signing failed:", error);
    throw error;
  }
}

/**
 * Derive address from public key
 */
export function pubkeyToAddress(pubkeyHex: string): string {
  try {
    const pubkey = bsv.PublicKey.fromString(pubkeyHex, "hex");
    const address = bsv.Address.fromPublicKey(pubkey);
    return address.toString();
  } catch (error) {
    console.error("Address derivation failed:", error);
    throw error;
  }
}
