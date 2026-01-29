#!/bin/bash

# Test publishing transaction via API using curl
# This simulates what the test client would do

echo "📝 RareGen Publishing Test (Curl)"
echo "=================================================="

API_URL="https://api.raregeneration.me"
PUBKEY="02b0f4d076298f6ec61c728f5dec4cce823c7af258d110ee4065f65b9b98f722bb"
RECORD_ID="TEST-$(date +%s)"

# Create test payload (simplified - without real signature for now)
# In production, signature would be ECDSA signed with private key
PAYLOAD=$(cat <<EOF
{
  "protocol": "sl-drm",
  "version": 1,
  "record": {
    "recordId": "$RECORD_ID",
    "rightsType": "streaming",
    "owners": [
      {
        "entityName": "Test Publisher",
        "share": 100
      }
    ],
    "territories": ["US", "CA"],
    "terms": {
      "startDate": "2026-01-01",
      "endDate": "2026-12-31"
    }
  },
  "signer": {
    "pubkey": "$PUBKEY"
  },
  "signature": {
    "alg": "ecdsa",
    "hash": "test-hash-value",
    "sig": "test-signature-value"
  }
}
EOF
)

echo "🔑 Public Key: $PUBKEY"
echo "📋 Record ID: $RECORD_ID"
echo "📍 API URL: $API_URL"
echo ""
echo "📤 Submitting to API..."

# Submit to API
RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  "$API_URL/v1/publish")

echo ""
echo "📊 Response:"
echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
