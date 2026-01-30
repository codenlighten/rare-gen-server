-- Migration 003: Add updated_at trigger to publish_jobs
-- Ensures updated_at is automatically set on every update

-- Function to update timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger on publish_jobs
DROP TRIGGER IF EXISTS update_publish_jobs_updated_at ON publish_jobs;
CREATE TRIGGER update_publish_jobs_updated_at
    BEFORE UPDATE ON publish_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add index for worker job claiming
CREATE INDEX IF NOT EXISTS idx_publish_jobs_claim ON publish_jobs(status, created_at) 
WHERE status IN ('queued', 'processing');

-- Verify
SELECT 
    schemaname, 
    tablename, 
    indexname 
FROM pg_indexes 
WHERE tablename = 'publish_jobs';
