/**
 * Core type definitions for DRM Publisher Container
 */
export interface PublishingRecord {
    protocol: string;
    version: number;
    record: RightsRecord;
    signer: SignerInfo;
    signature: SignatureData;
}
export interface RightsRecord {
    type: "music" | "movie" | "book" | "document";
    assetId: string;
    recordId: string;
    event: "REGISTER" | "UPDATE" | "ASSIGN" | "SPLIT_CHANGE";
    timestamp: string;
    owners: Owner[];
    distribution: Distribution;
    terms: Terms;
    nonce: string;
}
export interface Owner {
    partyId: string;
    role: "publisher" | "writer" | "artist" | "producer" | "label";
    shareBps: number;
}
export interface Distribution {
    cdnUrl?: string;
    sha256?: string;
    contentType?: string;
}
export interface Terms {
    territory: string;
    rights: string[];
    mechanical?: boolean;
}
export interface SignerInfo {
    pubkey: string;
    address?: string;
}
export interface SignatureData {
    alg: string;
    hash: string;
    sig: string;
}
export interface PublishJob {
    jobId: string;
    recordId: string;
    recordCanonical: string;
    recordHash: string;
    cdnUrl?: string;
    fileSha256?: string;
    status: "queued" | "sent" | "confirmed" | "failed";
    txid?: string;
    errorCode?: string;
    errorDetail?: string;
    createdAt: Date;
    sentAt?: Date;
    confirmedAt?: Date;
}
export interface RegisteredKey {
    id: number;
    pubkeyHex: string;
    pubkeyHash160?: string;
    status: "active" | "revoked";
    policyJson?: Record<string, unknown>;
    createdAt: Date;
}
export interface OnChainPayload {
    p: string;
    v: number;
    t: string;
    rid: string;
    hash: string;
    uri?: string;
    ts: string;
}
export interface PublishResponse {
    ok: boolean;
    recordId?: string;
    hash?: string;
    jobId?: string;
    status?: string;
    error?: string;
}
export interface HealthStatus {
    ok: boolean;
    database: "connected" | "disconnected";
    redis: "connected" | "disconnected";
    timestamp: string;
}
//# sourceMappingURL=index.d.ts.map