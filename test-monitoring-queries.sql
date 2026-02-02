-- 600-Job Load Test Monitoring Queries
-- Use with: docker-compose exec postgres psql -U postgres -d raregen

-- ============================================
-- Query 1: Rate Limiter Ceiling Proof
-- ============================================
-- Should hover near 500 during the test, never exceed it
-- Run this repeatedly (every 1-2 seconds) during the test

SELECT 
  COUNT(*) AS sent_last_3s,
  ROUND(COUNT(*) / 3.0, 2) AS tx_per_sec
FROM publish_jobs
WHERE status='sent' 
  AND sent_at > NOW() - INTERVAL '3 seconds';

-- ============================================
-- Query 2: No Stuck Jobs (Health Check)
-- ============================================
-- Should always be 0 (jobs in 'sending' for >2 min are stuck)

SELECT COUNT(*) AS stuck_sending
FROM publish_jobs
WHERE status='sending'
  AND sending_started_at < NOW() - INTERVAL '2 minutes';

-- ============================================
-- Query 3: UTXO Pool Status by State
-- ============================================
-- Shows available vs reserved vs spent
-- During heavy publishing, 'reserved' will temporarily increase

SELECT 
  status, 
  COUNT(*) AS n,
  ROUND(COUNT(*) / 166.67, 1) AS seconds_at_ceiling
FROM utxos
WHERE purpose='publish' AND satoshis=100
GROUP BY status
ORDER BY status;

-- ============================================
-- Query 4: Batch Processing Stats
-- ============================================
-- Shows batches created and their sizes

SELECT 
  batch_id,
  COUNT(*) AS jobs,
  MIN(batch_seq) AS first_seq,
  MAX(batch_seq) AS last_seq,
  MIN(created_at) AS created,
  MIN(sending_started_at) AS started,
  MAX(sent_at) AS completed,
  EXTRACT(EPOCH FROM (MAX(sent_at) - MIN(sending_started_at))) AS duration_sec
FROM publish_jobs
WHERE batch_id IS NOT NULL
GROUP BY batch_id
ORDER BY created DESC
LIMIT 10;

-- ============================================
-- Query 5: Overall Test Progress
-- ============================================
-- Total jobs by status

SELECT 
  status,
  COUNT(*) AS jobs
FROM publish_jobs
GROUP BY status
ORDER BY 
  CASE status
    WHEN 'pending' THEN 1
    WHEN 'sending' THEN 2
    WHEN 'sent' THEN 3
    WHEN 'failed' THEN 4
  END;

-- ============================================
-- Query 6: Error Analysis (if any failures)
-- ============================================

SELECT 
  error,
  COUNT(*) AS count
FROM publish_jobs
WHERE status='failed'
GROUP BY error
ORDER BY count DESC;

-- ============================================
-- Query 7: Throughput Over Time (1-second buckets)
-- ============================================
-- Shows tx/sec distribution during the test

SELECT 
  DATE_TRUNC('second', sent_at) AS second,
  COUNT(*) AS tx_count
FROM publish_jobs
WHERE status='sent'
  AND sent_at > NOW() - INTERVAL '2 minutes'
GROUP BY DATE_TRUNC('second', sent_at)
ORDER BY second DESC
LIMIT 60;
