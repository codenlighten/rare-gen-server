#!/bin/bash

# Test the API with sample requests

BASE_URL="${1:-http://localhost:3000}"

echo "🧪 RareGen Publisher API Tests"
echo "Base URL: $BASE_URL"
echo ""

# Test 1: Health check
echo "1️⃣  Testing /health"
curl -s "$BASE_URL/health" | jq . || echo "Failed"
echo ""

# Test 2: Info
echo "2️⃣  Testing /info"
curl -s "$BASE_URL/info" | jq . || echo "Failed"
echo ""

# Test 3: Submit signed publishing intent (requires valid signature)
echo "3️⃣  Testing /v1/publish (with sample payload)"
echo "Note: This will fail without a valid signature. See SIGNING.md for details."
echo ""

# Build a sample intent (in practice, this would be signed client-side)
SAMPLE_INTENT='{
  "protocol": "sl-drm",
  "version": 1,
  "record": {
    "type": "music",
    "assetId": "ASSET_TEST_001",
    "recordId": "REC_TEST_001",
    "event": "REGISTER",
    "timestamp": "'$(date -u +'%Y-%m-%dT%H:%M:%S.000Z')'",
    "owners": [
      {
        "partyId": "PUB_TEST",
        "role": "publisher",
        "shareBps": 5000
      }
    ],
    "distribution": {
      "cdnUrl": "https://example.com/rights.json",
      "sha256": "abc123def456",
      "contentType": "application/json"
    },
    "terms": {
      "territory": "WORLD",
      "rights": ["stream", "download"],
      "mechanical": true
    },
    "nonce": "dGVzdF9ub25jZQ=="
  },
  "signer": {
    "pubkey": "02b0f4d076298f6ec61c728f5dec4cce823c7af258d110ee4065f65b9b98f722bb"
  },
  "signature": {
    "alg": "bsv-ecdsa-secp256k1",
    "hash": "sha256",
    "sig": "INVALID_SIGNATURE"
  }
}'

curl -s -X POST "$BASE_URL/v1/publish" \
  -H "Content-Type: application/json" \
  -d "$SAMPLE_INTENT" | jq . || echo "Failed"

echo ""
echo "✅ Basic API tests complete"
