# Batch Mode Deployment & Testing Guide

## Architecture

**Batch mode replaces BullMQ worker with DB-based loops:**
- **Collector loop** (every 5s): Claims up to 500 queued jobs into batches
- **Broadcaster loop** (continuous): Processes batches with token bucket rate limiting
- **Rate limit**: 500 tx per 3 seconds (configurable)

## Deployment

### 1. Apply Migration 006

```bash
# Copy migration to server
scp migrations/006_add_batch_seq.sql root@167.99.179.216:/tmp/

# Apply migration
ssh root@167.99.179.216 'docker exec -i raregen_postgres_1 psql -U postgres -d raregen < /tmp/006_add_batch_seq.sql'
```

### 2. Deploy Batch Worker

```bash
# Build and deploy
./deploy-worker.sh

# On server, switch to batch mode
ssh root@167.99.179.216 'cd /opt/raregen && \
  docker-compose --profile single stop worker && \
  docker-compose --profile batch up -d batch-worker'
```

### 3. Verify Batch Worker Running

```bash
ssh root@167.99.179.216 'cd /opt/raregen && docker-compose ps batch-worker'
ssh root@167.99.179.216 'cd /opt/raregen && docker-compose logs --tail=50 batch-worker'
```

## Testing

### Load Test (100 jobs)

```bash
chmod +x test-batch-load.sh
API_URL=https://api.raregeneration.me ./test-batch-load.sh 100
```

### Monitor Batch Collection

```bash
# Watch collector create batches
ssh root@167.99.179.216 'cd /opt/raregen && docker-compose logs -f batch-worker | grep Collector'

# Watch broadcaster process jobs
ssh root@167.99.179.216 'cd /opt/raregen && docker-compose logs -f batch-worker | grep "✓ Job"'
```

### Check Queue Status

```bash
ssh root@167.99.179.216 'docker exec -i raregen_postgres_1 psql -U postgres -d raregen -c "
  SELECT 
    status,
    COUNT(*) as count,
    COUNT(DISTINCT processing_batch_id) as batches
  FROM publish_jobs
  GROUP BY status
  ORDER BY status;"'
```

### Check Batch Details

```bash
ssh root@167.99.179.216 'docker exec -i raregen_postgres_1 psql -U postgres -d raregen -c "
  SELECT 
    processing_batch_id,
    COUNT(*) as jobs,
    MIN(batch_seq) as first_seq,
    MAX(batch_seq) as last_seq,
    MIN(created_at) as created,
    COUNT(CASE WHEN status = '\''sent'\'' THEN 1 END) as sent,
    COUNT(CASE WHEN status = '\''failed'\'' THEN 1 END) as failed
  FROM publish_jobs
  WHERE processing_batch_id IS NOT NULL
  GROUP BY processing_batch_id
  ORDER BY created DESC
  LIMIT 10;"'
```

## Rate Limiting Verification

The token bucket enforces 500 tx per 3 seconds:
- **Burst**: Up to 500 immediate broadcasts
- **Continuous**: ~166 tx/second sustained
- **Recovery**: Tokens refill continuously

### Test Rate Limit

```bash
# Submit 1000 jobs
./test-batch-load.sh 1000

# Watch throughput (should plateau at ~166/sec)
watch -n 1 'ssh root@167.99.179.216 "docker exec -i raregen_postgres_1 psql -U postgres -d raregen -t -c \"SELECT COUNT(*) FROM publish_jobs WHERE status = '\''sent'\'' AND sent_at > NOW() - INTERVAL '\''10 seconds'\'';\""'
```

## Switching Modes

### To Batch Mode (High Volume)

```bash
ssh root@167.99.179.216 'cd /opt/raregen && \
  docker-compose --profile single stop worker && \
  docker-compose --profile batch up -d batch-worker'
```

### To Single Job Mode (Low Volume)

```bash
ssh root@167.99.179.216 'cd /opt/raregen && \
  docker-compose --profile batch stop batch-worker && \
  docker-compose --profile single up -d worker'
```

## Monitoring Metrics

### Key Metrics to Watch

1. **Queue Depth**: `SELECT COUNT(*) FROM publish_jobs WHERE status = 'queued'`
2. **Batch Size**: Average jobs per batch
3. **Processing Rate**: Jobs sent per second
4. **UTXO Pool**: Available UTXOs
5. **Error Rate**: Failed jobs per batch

### Grafana Dashboard (Phase 2)

Metrics to expose on `/metrics` endpoint:
- `raregen_queue_depth{status="queued|processing_batch|sending|sent|failed"}`
- `raregen_batch_size_bucket`
- `raregen_broadcast_rate`
- `raregen_utxo_available`
- `raregen_error_rate`

## Troubleshooting

### Jobs Stuck in 'sending'

```bash
# Unstick manually
ssh root@167.99.179.216 'docker exec -i raregen_postgres_1 psql -U postgres -d raregen -c "
  UPDATE publish_jobs
  SET status = '\''processing_batch'\'', sending_started_at = NULL
  WHERE status = '\''sending'\''
    AND sending_started_at < NOW() - INTERVAL '\''2 minutes'\'';"'
```

### Reset Rate Limiter

Restart batch worker:
```bash
ssh root@167.99.179.216 'cd /opt/raregen && docker-compose restart batch-worker'
```

### View Dirty UTXOs

```bash
ssh root@167.99.179.216 'docker exec -i raregen_postgres_1 psql -U postgres -d raregen -c "
  SELECT id, txid, vout, satoshis, dirty, reserved_at
  FROM utxos
  WHERE dirty = TRUE
  ORDER BY created_at DESC
  LIMIT 20;"'
```

## Performance Expectations

### Theoretical Maximum
- Rate limit: 500 tx per 3 seconds = 166.67 tx/sec
- Daily capacity: 14.4 million transactions

### Real-World Performance
- Batch collection: ~0.5s for 500 jobs
- Transaction building: ~10ms per tx
- Broadcast: ~100-300ms per tx (network dependent)
- **Expected sustained rate**: 100-150 tx/sec

### Bottlenecks (in order)
1. UTXO pool exhaustion (mitigated by auto-split)
2. Explorer broadcast latency
3. Database transaction throughput
4. Token bucket rate limit (configurable)

## Production Checklist

- [x] Migration 006 applied (batch_seq column)
- [x] Token bucket rate limiter implemented
- [x] Collector loop (5s window)
- [x] Broadcaster loop (continuous)
- [x] UTXO timeout cleanup (5 minutes)
- [x] Dirty UTXO tracking
- [x] Stuck job recovery (2 minute TTL)
- [ ] Prometheus metrics endpoint
- [ ] Grafana dashboard
- [ ] Load testing (5,000+ jobs)
- [ ] Auto-UTXO pool refill (Phase 2)
