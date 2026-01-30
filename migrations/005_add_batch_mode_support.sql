-- Migration 005: Add processing_batch_id for batch mode
-- Supports bundled publishing (500 tx/3s)

-- Add batch tracking to publish_jobs
ALTER TABLE publish_jobs ADD COLUMN IF NOT EXISTS processing_batch_id VARCHAR(50);

-- Add batch metadata table
CREATE TABLE IF NOT EXISTS publish_batches (
  batch_id VARCHAR(50) PRIMARY KEY,
  job_count INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'collecting', -- collecting, broadcasting, completed, failed
  txids TEXT[], -- array of broadcast txids
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  broadcasted_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_detail TEXT
);

-- Index for batch job lookup
CREATE INDEX IF NOT EXISTS idx_publish_jobs_batch 
ON publish_jobs(processing_batch_id) 
WHERE processing_batch_id IS NOT NULL;

-- Index for batch status queries
CREATE INDEX IF NOT EXISTS idx_publish_batches_status 
ON publish_batches(status, created_at);

-- Verify
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'publish_batches' 
ORDER BY ordinal_position;
