-- Migration 002: Add id column to publish_jobs table
-- The table was initially created without an id column

export const up = `
ALTER TABLE publish_jobs
ADD COLUMN id SERIAL;

-- Make job_id non-primary after adding id
ALTER TABLE publish_jobs DROP CONSTRAINT publish_jobs_pkey;
ALTER TABLE publish_jobs ADD PRIMARY KEY (id);

-- Keep job_id unique
CREATE UNIQUE INDEX IF NOT EXISTS idx_publish_jobs_job_id ON publish_jobs(job_id);
`;

export const down = `
-- Reverse the changes
ALTER TABLE publish_jobs DROP CONSTRAINT publish_jobs_pkey;
ALTER TABLE publish_jobs DROP COLUMN id;
ALTER TABLE publish_jobs ADD PRIMARY KEY (job_id);
DROP INDEX IF EXISTS idx_publish_jobs_job_id;
`;
