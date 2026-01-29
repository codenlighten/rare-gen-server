#!/bin/bash

# Test Broadcasting Transaction - Send 100 sats to yourself
# This script builds and broadcasts a transaction using the SmartLedger Explorer API

set -e

# Configuration
BASE_URL="${1:-http://localhost:3000}"
CHAIN="${2:-bsv}"
NETWORK="${3:-main}"

# Load environment variables
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}SmartLedger - Transaction Test${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Configuration:"
echo "  Base URL: $BASE_URL"
echo "  Chain: $CHAIN"
echo "  Network: $NETWORK"
echo "  Address: $BSV_ADDRESS"
echo ""

# Step 1: Fetch UTXOs
echo -e "${YELLOW}[Step 1]${NC} Fetching UTXOs..."
utxos_response=$(curl -s "$BASE_URL/api/$CHAIN/$NETWORK/address/$BSV_ADDRESS/utxos")

if echo "$utxos_response" | jq -e '.data.result | length > 0' >/dev/null 2>&1; then
  echo -e "${GREEN}✓ Found UTXOs${NC}"
  utxo_count=$(echo "$utxos_response" | jq '.data.result | length')
  echo "  Available UTXOs: $utxo_count"
  
  # Show first UTXO details
  first_utxo=$(echo "$utxos_response" | jq '.data.result[0]')
  echo "  First UTXO:"
  echo "    TX Hash: $(echo "$first_utxo" | jq -r '.tx_hash')"
  echo "    Value: $(echo "$first_utxo" | jq -r '.value') sats"
  echo "    Script: $(echo "$first_utxo" | jq -r '.scriptPubKey')"
else
  echo -e "${RED}✗ No UTXOs found${NC}"
  echo "  Response: $utxos_response"
  exit 1
fi

# Step 2: Fetch balance
echo ""
echo -e "${YELLOW}[Step 2]${NC} Fetching balance..."
balance_response=$(curl -s "$BASE_URL/api/$CHAIN/$NETWORK/address/$BSV_ADDRESS/balance")

if echo "$balance_response" | jq -e '.data.confirmed' >/dev/null 2>&1; then
  confirmed=$(echo "$balance_response" | jq -r '.data.confirmed')
  unconfirmed=$(echo "$balance_response" | jq -r '.data.unconfirmed')
  total=$(echo "$balance_response" | jq -r '.data.total')
  
  echo -e "${GREEN}✓ Balance retrieved${NC}"
  echo "  Confirmed: $confirmed sats"
  echo "  Unconfirmed: $unconfirmed sats"
  echo "  Total: $total sats"
  
  if [ "$confirmed" -lt 1000 ]; then
    echo -e "${RED}⚠ Warning: Balance may be insufficient for transaction + fees${NC}"
  fi
else
  echo -e "${RED}✗ Failed to fetch balance${NC}"
  exit 1
fi

# Step 3: Get address info (includes script)
echo ""
echo -e "${YELLOW}[Step 3]${NC} Getting address info..."
info_response=$(curl -s "$BASE_URL/api/$CHAIN/$NETWORK/address/$BSV_ADDRESS/info")

if echo "$info_response" | jq -e '.data.isvalid' >/dev/null 2>&1; then
  is_valid=$(echo "$info_response" | jq -r '.data.isvalid')
  script=$(echo "$info_response" | jq -r '.data.scriptPubKey')
  
  echo -e "${GREEN}✓ Address info retrieved${NC}"
  echo "  Valid: $is_valid"
  echo "  Script: $script"
else
  echo -e "${RED}✗ Failed to get address info${NC}"
  exit 1
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${YELLOW}Transaction Building Notes${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "To build and broadcast a transaction with the script:"
echo "1. Use an offline signing tool (e.g., @smartledger/bsv CLI or custom script)"
echo "2. Build transaction with:"
echo "   - Input UTXO: $first_utxo"
echo "   - Output: $BSV_ADDRESS"
echo "   - Amount: 100 sats"
echo "   - Fee: ~225 sats (estimated)"
echo "3. Sign transaction with: $BSV_PRIVATE_KEY"
echo "4. Broadcast using the broadcast endpoint:"
echo "   curl -X POST $BASE_URL/api/$CHAIN/$NETWORK/tx/broadcast \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"txHex\":\"<signed_tx_hex>\"}'"
echo ""

# Step 4: Create Node.js script to build and sign transaction
echo -e "${YELLOW}[Step 4]${NC} Creating transaction building script..."

cat > build-and-broadcast-tx.js << 'NODEJS_SCRIPT'
#!/usr/bin/env node

const axios = require('axios');
const bsv = require('@smartledger/bsv');
require('dotenv').config();

const BASE_URL = process.argv[2] || 'http://localhost:3000';
const CHAIN = process.argv[3] || 'bsv';
const NETWORK = process.argv[4] || 'main';

const ADDRESS = process.env.BSV_ADDRESS;
const PRIVATE_KEY = process.env.BSV_PRIVATE_KEY;
const AMOUNT_SATS = 100;
const FEE_SATS = 225; // Estimated fee

async function buildAndBroadcast() {
  try {
    console.log('\n🔨 Building Transaction...\n');
    
    // Fetch UTXOs
    console.log('1️⃣  Fetching UTXOs...');
    const utxosRes = await axios.get(`${BASE_URL}/api/${CHAIN}/${NETWORK}/address/${ADDRESS}/utxos`);
    const utxos = utxosRes.data.data.result;
    
    if (utxos.length === 0) {
      console.error('❌ No UTXOs available');
      process.exit(1);
    }
    
    const utxo = utxos[0];
    console.log(`✅ Found UTXO: ${utxo.tx_hash} (${utxo.value} sats)`);
    
    // Build transaction
    console.log('\n2️⃣  Building transaction...');
    const privateKey = bsv.PrivateKey.fromWIF(PRIVATE_KEY);
    const fromAddress = bsv.Address.fromString(ADDRESS);
    
    const tx = new bsv.Transaction()
      .from({
        txid: utxo.tx_hash,
        outputIndex: utxo.tx_pos,
        script: bsv.Script.fromHex(utxo.scriptPubKey),
        satoshis: utxo.value
      })
      .to(ADDRESS, AMOUNT_SATS)
      .fee(FEE_SATS)
      .sign(privateKey);
    
    const txHex = tx.toString('hex');
    console.log(`✅ Transaction built`);
    console.log(`   TX Size: ${tx.size} bytes`);
    console.log(`   Input: ${utxo.value} sats`);
    console.log(`   Output: ${AMOUNT_SATS} sats`);
    console.log(`   Fee: ${FEE_SATS} sats`);
    console.log(`   Change: ${utxo.value - AMOUNT_SATS - FEE_SATS} sats`);
    
    // Broadcast transaction
    console.log('\n3️⃣  Broadcasting transaction...');
    const broadcastRes = await axios.post(
      `${BASE_URL}/api/${CHAIN}/${NETWORK}/tx/broadcast`,
      { txHex: txHex },
      { headers: { 'Content-Type': 'application/json' } }
    );
    
    console.log(`✅ Transaction broadcast successfully!`);
    console.log(`   TXID: ${broadcastRes.data.data.txid || broadcastRes.data.data}`);
    console.log(`\n📊 Transaction Details:`);
    console.log(`   From: ${ADDRESS}`);
    console.log(`   To: ${ADDRESS}`);
    console.log(`   Amount: ${AMOUNT_SATS} sats`);
    console.log(`   Hex: ${txHex}`);
    
  } catch (error) {
    console.error('\n❌ Error:', error.response?.data || error.message);
    process.exit(1);
  }
}

buildAndBroadcast();
NODEJS_SCRIPT

chmod +x build-and-broadcast-tx.js
echo -e "${GREEN}✓ Created build-and-broadcast-tx.js${NC}"

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${YELLOW}Next Steps${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "To send 100 sats to yourself, run:"
echo -e "${GREEN}node build-and-broadcast-tx.js $BASE_URL $CHAIN $NETWORK${NC}"
echo ""
echo "Or test the broadcast endpoint manually:"
echo -e "${GREEN}curl -X POST $BASE_URL/api/$CHAIN/$NETWORK/tx/broadcast \\${NC}"
echo -e "${GREEN}  -H 'Content-Type: application/json' \\${NC}"
echo -e "${GREEN}  -d '{\"txHex\":\"<your_signed_tx_hex>\"}'${NC}"
echo ""
