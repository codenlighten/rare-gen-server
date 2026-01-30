-- Migration 006: Add batch_seq for deterministic batch ordering
-- This enables immutable, replayable batches with strict ordering

ALTER TABLE publish_jobs
  ADD COLUMN IF NOT EXISTS batch_seq INT;

CREATE INDEX IF NOT EXISTS idx_publish_jobs_batch_order
  ON publish_jobs (processing_batch_id, batch_seq)
  WHERE processing_batch_id IS NOT NULL;

-- Add sending_started_at for stuck job recovery
ALTER TABLE publish_jobs
  ADD COLUMN IF NOT EXISTS sending_started_at TIMESTAMP;

-- Update status enum documentation (comment only, no constraint)
COMMENT ON COLUMN publish_jobs.status IS 'queued | processing_batch | sending | sent | failed | retryable';
