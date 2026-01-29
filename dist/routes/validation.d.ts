/**
 * Signature verification middleware and validation logic
 */
import { RightsRecord } from "../types";
/**
 * Validate PublishingRecord structure and signature
 */
export declare function validatePublishIntent(payload: unknown): Promise<{
    valid: boolean;
    error?: string;
    record?: RightsRecord;
    recordHash?: string;
    pubkeyHex?: string;
}>;
/**
 * Record nonce usage
 */
export declare function recordNonceUsage(pubkeyHex: string, nonce: string, recordId: string): Promise<void>;
//# sourceMappingURL=validation.d.ts.map