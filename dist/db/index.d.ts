/**
 * PostgreSQL connection and initialization
 */
import { Pool } from "pg";
export declare function initDb(): Promise<Pool>;
export declare function getPool(): Pool;
export declare function closeDb(): Promise<void>;
/**
 * Run a migration (SQL file)
 */
export declare function runMigration(name: string, sql: string): Promise<void>;
/**
 * Helper: insert a registered key
 */
export declare function insertRegisteredKey(pubkeyHex: string, pubkeyHash160?: string, policyJson?: Record<string, unknown>): Promise<{
    id: number;
}>;
/**
 * Helper: check if nonce is used
 */
export declare function isNonceUsed(pubkeyHex: string, nonce: string): Promise<boolean>;
/**
 * Helper: record nonce usage
 */
export declare function recordNonce(pubkeyHex: string, nonce: string, recordId: string): Promise<void>;
/**
 * Helper: create publish job
 */
export declare function createPublishJob(recordId: string, recordCanonical: string, recordHash: string, cdnUrl?: string, cdnSha256?: string): Promise<string>;
//# sourceMappingURL=index.d.ts.map