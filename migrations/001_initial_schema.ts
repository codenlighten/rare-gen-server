/**
 * Migration 001: Initial schema
 * Creates tables for registered keys, nonces, publish jobs, UTXOs
 */

export const MIGRATION_001 = `
-- Registered keys (public key registry)
CREATE TABLE IF NOT EXISTS registered_keys (
  id SERIAL PRIMARY KEY,
  pubkey_hex VARCHAR(130) NOT NULL UNIQUE,
  pubkey_hash160 VARCHAR(40),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  policy_json JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_registered_keys_status ON registered_keys(status);
CREATE INDEX IF NOT EXISTS idx_registered_keys_pubkey_hash ON registered_keys(pubkey_hash160);

-- Nonces (replay protection)
CREATE TABLE IF NOT EXISTS nonces (
  id SERIAL PRIMARY KEY,
  pubkey_hex VARCHAR(130) NOT NULL,
  nonce TEXT NOT NULL,
  record_id VARCHAR(100),
  seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (pubkey_hex, nonce)
);

CREATE INDEX IF NOT EXISTS idx_nonces_pubkey ON nonces(pubkey_hex);
CREATE INDEX IF NOT EXISTS idx_nonces_cleanup ON nonces(seen_at);

-- Publish jobs
CREATE TABLE IF NOT EXISTS publish_jobs (
  id SERIAL PRIMARY KEY,
  job_id VARCHAR(50) NOT NULL UNIQUE,
  record_id VARCHAR(100) NOT NULL,
  record_canonical TEXT NOT NULL,
  record_hash VARCHAR(64) NOT NULL UNIQUE,
  cdn_url TEXT,
  file_sha256 VARCHAR(64),
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  txid VARCHAR(64),
  error_code VARCHAR(50),
  error_detail TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMP,
  confirmed_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_publish_jobs_status ON publish_jobs(status);
CREATE INDEX IF NOT EXISTS idx_publish_jobs_record_id ON publish_jobs(record_id);
CREATE INDEX IF NOT EXISTS idx_publish_jobs_txid ON publish_jobs(txid) WHERE txid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_publish_jobs_created ON publish_jobs(created_at);

-- UTXOs (pool management)
CREATE TABLE IF NOT EXISTS utxos (
  id SERIAL PRIMARY KEY,
  txid VARCHAR(64) NOT NULL,
  vout INTEGER NOT NULL,
  satoshis BIGINT NOT NULL,
  script_pub_key TEXT NOT NULL,
  address VARCHAR(100) NOT NULL,
  purpose VARCHAR(50) NOT NULL DEFAULT 'publish_pool',
  status VARCHAR(20) NOT NULL DEFAULT 'available',
  reserved_at TIMESTAMP,
  reserved_by_job_id VARCHAR(50),
  spent_at TIMESTAMP,
  spent_by_txid VARCHAR(64),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (txid, vout)
);

CREATE INDEX IF NOT EXISTS idx_utxos_status ON utxos(status);
CREATE INDEX IF NOT EXISTS idx_utxos_purpose_status ON utxos(purpose, status);
CREATE INDEX IF NOT EXISTS idx_utxos_address ON utxos(address);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  actor_pubkey VARCHAR(130),
  resource_type VARCHAR(50),
  resource_id VARCHAR(100),
  action VARCHAR(50),
  details JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_pubkey);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
`;
