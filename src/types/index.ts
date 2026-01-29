/**
 * Core type definitions for DRM Publisher Container
 */

export interface PublishingRecord {
  protocol: string; // "sl-drm"
  version: number; // 1
  record: RightsRecord;
  signer: SignerInfo;
  signature: SignatureData;
}

export interface RightsRecord {
  type: "music" | "movie" | "book" | "document";
  assetId: string;
  recordId: string;
  event: "REGISTER" | "UPDATE" | "ASSIGN" | "SPLIT_CHANGE";
  timestamp: string; // ISO 8601
  owners: Owner[];
  distribution: Distribution;
  terms: Terms;
  nonce: string; // base64
}

export interface Owner {
  partyId: string;
  role: "publisher" | "writer" | "artist" | "producer" | "label";
  shareBps: number; // basis points (5000 = 50%)
}

export interface Distribution {
  cdnUrl?: string;
  sha256?: string; // file hash hex
  contentType?: string;
}

export interface Terms {
  territory: string;
  rights: string[];
  mechanical?: boolean;
}

export interface SignerInfo {
  pubkey: string; // hex compressed pubkey
  address?: string; // optional: derived address
}

export interface SignatureData {
  alg: string; // "bsv-ecdsa-secp256k1"
  hash: string; // "sha256"
  sig: string; // base64 or hex signature
}

export interface PublishJob {
  jobId: string;
  recordId: string;
  recordCanonical: string;
  recordHash: string; // sha256 hex
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
  p: string; // "sl-drm"
  v: number; // 1
  t: string; // type
  rid: string; // record id
  hash: string; // sha256 hex
  uri?: string; // cdn url
  ts: string; // ISO timestamp
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
