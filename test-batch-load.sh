#!/bin/bash
# Test batch mode with high-volume job submission

set -e

API_URL="${API_URL:-https://api.raregeneration.me}"
NUM_JOBS="${1:-100}"

echo "========================================="
echo "Batch Mode Load Test"
echo "========================================="
echo "API: $API_URL"
echo "Jobs: $NUM_JOBS"
echo "========================================="
echo ""

# Load identity key
IDENTITY_PRIVATE_KEY="${TEST_USER_IDENTITY_PRIVATE_KEY}"
IDENTITY_PUBLIC_KEY="${TEST_USER_IDENTITY_PUBLIC_KEY}"

if [ -z "$IDENTITY_PRIVATE_KEY" ]; then
  echo "❌ TEST_USER_IDENTITY_PRIVATE_KEY not set in environment"
  exit 1
fi

echo "📤 Submitting $NUM_JOBS jobs..."
echo ""

START_TIME=$(date +%s)
SUBMITTED=0
FAILED=0

for i in $(seq 1 $NUM_JOBS); do
  RECORD_ID="BATCH_TEST_$START_TIME_$i"
  
  # Create a simple test record
  RECORD=$(cat <<EOF
{
  "recordId": "$RECORD_ID",
  "type": "music",
  "event": "REGISTER",
  "territory": "US",
  "timestamp": $(date +%s)
}
EOF
)

  # Submit to API (without full signature verification for speed)
  RESPONSE=$(curl -s -X POST "$API_URL/v1/publish" \
    -H "Content-Type: application/json" \
    -d "{
      \"publickey\": \"$IDENTITY_PUBLIC_KEY\",
      \"signature\": \"dummy_sig_for_load_test\",
      \"nonce\": \"$START_TIME$i\",
      \"record\": $RECORD
    }" 2>&1)
  
  if echo "$RESPONSE" | grep -q '"ok":true'; then
    SUBMITTED=$((SUBMITTED + 1))
    if [ $((SUBMITTED % 10)) -eq 0 ]; then
      echo "  ✓ Submitted $SUBMITTED/$NUM_JOBS"
    fi
  else
    FAILED=$((FAILED + 1))
    if [ $((FAILED % 10)) -eq 0 ]; then
      echo "  ✗ Failed: $FAILED"
    fi
  fi
done

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo ""
echo "========================================="
echo "Submission Complete"
echo "========================================="
echo "Submitted: $SUBMITTED/$NUM_JOBS"
echo "Failed: $FAILED"
echo "Time: ${ELAPSED}s"
echo "Rate: $((SUBMITTED / ELAPSED)) jobs/sec"
echo ""
echo "📊 Check batch collection:"
echo "  ssh root@167.99.179.216 'docker-compose logs -f batch-worker'"
echo ""
echo "📊 Check queue depth:"
echo "  ssh root@167.99.179.216 'docker exec -i raregen_postgres_1 psql -U postgres -d raregen -c \"SELECT status, COUNT(*) FROM publish_jobs GROUP BY status;\"'"
echo ""
