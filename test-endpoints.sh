#!/bin/bash

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="${1:-http://localhost:3000}"
CHAIN="${2:-bsv}"
NETWORK="${3:-main}"
TEST_ADDRESS="1L2F8wYxTRagCZLnsm2engg8ngGECSeuE5"
TEST_TXID="6cc9631ef3dad77eb0141134167f20469d0b4e61405de57fe6a9ac71b943bb9f"

# Stats
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function to test endpoint
test_endpoint() {
  local name="$1"
  local method="$2"
  local endpoint="$3"
  local expected_code="$4"
  local data="$5"
  
  TESTS_RUN=$((TESTS_RUN + 1))
  
  echo -e "\n${BLUE}[Test $TESTS_RUN]${NC} $name"
  echo "  Method: $method"
  echo "  Endpoint: $endpoint"
  
  # Make request
  if [ "$method" = "POST" ]; then
    response=$(curl -s -w "\n%{http_code}" -X POST \
      -H "Content-Type: application/json" \
      -d "$data" \
      "$BASE_URL$endpoint")
  else
    response=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL$endpoint")
  fi
  
  # Extract status code and body
  http_code=$(echo "$response" | tail -n 1)
  body=$(echo "$response" | sed '$d')
  
  echo "  Status: $http_code"
  
  # Check if request was successful
  if [[ "$http_code" == "200" ]] || [[ "$http_code" == "$expected_code" ]]; then
    echo -e "  ${GREEN}✓ PASS${NC}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    
    # Pretty print response if it's valid JSON
    if echo "$body" | jq . >/dev/null 2>&1; then
      echo "  Response (first 500 chars):"
      echo "$body" | jq . | head -20 | sed 's/^/    /'
    fi
  else
    echo -e "  ${RED}✗ FAIL${NC} (Expected 200 or $expected_code, got $http_code)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    echo "  Response:"
    echo "$body" | head -10 | sed 's/^/    /'
  fi
}

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}SmartLedger Explorer - API Test Suite${NC}"
echo -e "${YELLOW}========================================${NC}"
echo "Base URL: $BASE_URL"
echo "Chain: $CHAIN"
echo "Network: $NETWORK"
echo ""

# Test 1: Health Check
test_endpoint \
  "Health Check" \
  "GET" \
  "/health" \
  "200"

# Test 2: Get Balance
test_endpoint \
  "Get Address Balance" \
  "GET" \
  "/api/$CHAIN/$NETWORK/address/$TEST_ADDRESS/balance" \
  "200"

# Test 3: Get All UTXOs
test_endpoint \
  "Get All UTXOs" \
  "GET" \
  "/api/$CHAIN/$NETWORK/address/$TEST_ADDRESS/utxos" \
  "200"

# Test 4: Get Confirmed UTXOs
test_endpoint \
  "Get Confirmed UTXOs" \
  "GET" \
  "/api/$CHAIN/$NETWORK/address/$TEST_ADDRESS/utxos/confirmed" \
  "200"

# Test 5: Get Unconfirmed UTXOs
test_endpoint \
  "Get Unconfirmed UTXOs" \
  "GET" \
  "/api/$CHAIN/$NETWORK/address/$TEST_ADDRESS/utxos/unconfirmed" \
  "200"

# Test 6: Get Transaction Details
test_endpoint \
  "Get Transaction Details" \
  "GET" \
  "/api/$CHAIN/$NETWORK/tx/$TEST_TXID" \
  "200"

# Test 7: Get Chain Info
test_endpoint \
  "Get Chain Info" \
  "GET" \
  "/api/$CHAIN/$NETWORK/chain/info" \
  "200"

# Test 8: Get Address History
test_endpoint \
  "Get Address History" \
  "GET" \
  "/api/$CHAIN/$NETWORK/address/$TEST_ADDRESS/history?limit=5" \
  "200"

# Test 9: Get Address Info
test_endpoint \
  "Get Address Info" \
  "GET" \
  "/api/$CHAIN/$NETWORK/address/$TEST_ADDRESS/info" \
  "200"

# Test 10: Bulk Balance (POST)
test_endpoint \
  "Get Bulk Balance (POST)" \
  "POST" \
  "/api/$CHAIN/$NETWORK/addresses/balance" \
  "200" \
  '{"addresses":["1L2F8wYxTRagCZLnsm2engg8ngGECSeuE5","1KGHhLTQaPr4LErrvbAuGE62yPpDoRwrob"]}'

# Test 11: Bulk UTXOs (POST)
test_endpoint \
  "Get Bulk UTXOs (POST)" \
  "POST" \
  "/api/$CHAIN/$NETWORK/addresses/utxos" \
  "200" \
  '{"addresses":["1L2F8wYxTRagCZLnsm2engg8ngGECSeuE5"]}'

# Test 12: Test P2PKH Script Injection
echo -e "\n${BLUE}[Test 12]${NC} Verify P2PKH Script Injection"
echo "  Checking if UTXOs have scriptPubKey field..."
utxo_response=$(curl -s "$BASE_URL/api/$CHAIN/$NETWORK/address/$TEST_ADDRESS/utxos")
if echo "$utxo_response" | jq '.data.result[0].scriptPubKey' | grep -q "76a914"; then
  echo -e "  ${GREEN}✓ PASS${NC} - scriptPubKey is properly injected"
  TESTS_PASSED=$((TESTS_PASSED + 1))
  echo "  scriptPubKey: $(echo "$utxo_response" | jq -r '.data.result[0].scriptPubKey')"
  echo "  isP2PKH: $(echo "$utxo_response" | jq -r '.data.result[0].isP2PKH')"
else
  echo -e "  ${RED}✗ FAIL${NC} - scriptPubKey not found or invalid"
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi
TESTS_RUN=$((TESTS_RUN + 1))

# Summary
echo -e "\n${YELLOW}========================================${NC}"
echo -e "${YELLOW}Test Summary${NC}"
echo -e "${YELLOW}========================================${NC}"
echo "Total Tests: $TESTS_RUN"
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed: ${RED}$TESTS_FAILED${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "\n${GREEN}✓ All tests passed!${NC}"
  exit 0
else
  echo -e "\n${RED}✗ Some tests failed${NC}"
  exit 1
fi
