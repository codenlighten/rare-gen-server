#!/bin/bash
# Monitor rate limiter ceiling during load test
# Usage: ./monitor-ceiling.sh [duration_seconds] [output_file]

DURATION=${1:-30}
OUTPUT_FILE=${2:-/tmp/ceiling-test.log}
DROPLET_IP="167.99.179.216"

echo "Monitoring rate limiter ceiling for $DURATION seconds..."
echo "Results will be saved to $OUTPUT_FILE"
echo ""
echo "Timestamp,sent_last_3s,tx_per_sec" > "$OUTPUT_FILE"

for i in $(seq 1 $DURATION); do
  RESULT=$(ssh root@$DROPLET_IP "cd /opt/raregen && docker-compose exec -T postgres psql -U postgres -d raregen -c \"SELECT COUNT(*) AS sent_last_3s, ROUND(COUNT(*) / 3.0, 2) AS tx_per_sec FROM publish_jobs WHERE status='sent' AND sent_at > NOW() - INTERVAL '3 seconds';\"" 2>&1 | grep -A1 "sent_last_3s" | tail -1)
  
  # Parse result
  SENT=$(echo "$RESULT" | awk '{print $1}')
  RATE=$(echo "$RESULT" | awk '{print $2}')
  
  TIMESTAMP=$(date -u +"%H:%M:%S")
  echo "$TIMESTAMP,$SENT,$RATE" | tee -a "$OUTPUT_FILE"
  
  # Show visual indicator
  if [ -n "$SENT" ] && [ "$SENT" -gt 0 ]; then
    BAR=$(printf '█%.0s' $(seq 1 $((SENT / 10))))
    printf "  [%-50s] %s/3s (%.2f tx/sec)\n" "$BAR" "$SENT" "$RATE"
  else
    echo "  [idle]"
  fi
  
  sleep 1
done

echo ""
echo "✅ Monitoring complete. Results saved to $OUTPUT_FILE"
echo ""
echo "Peak sent_last_3s:"
tail -n +2 "$OUTPUT_FILE" | cut -d, -f2 | sort -rn | head -1
echo ""
echo "Full results:"
column -t -s, "$OUTPUT_FILE"
