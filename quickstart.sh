#!/bin/bash

# Quick start guide for RareGen Publisher Container A

set -e

echo "🚀 RareGen Publisher - Quick Start"
echo ""

# Check for required tools
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Please install Docker."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose not found. Please install Docker Compose."
    exit 1
fi

# Check .env
if [ ! -f ".env" ]; then
    echo "❌ .env file not found. Please create one from .env.example"
    exit 1
fi

echo "1️⃣  Building Docker image..."
docker build -t raregen-publisher:latest .

echo ""
echo "2️⃣  Starting containers (postgres, redis, api, worker)..."
docker-compose up -d

echo ""
echo "3️⃣  Waiting for services to start..."
sleep 10

echo ""
echo "4️⃣  Running database migrations..."
docker-compose exec -T api node dist/db/index.js || true

echo ""
echo "✅ RareGen Publisher is running!"
echo ""
echo "📍 Access points:"
echo "   API Health:    http://localhost:3000/health"
echo "   API Info:      http://localhost:3000/info"
echo "   Publish:       POST http://localhost:3000/v1/publish"
echo "   Job Status:    GET http://localhost:3000/v1/job/:jobId"
echo ""
echo "🛑 To stop: docker-compose down"
echo "📊 To view logs: docker-compose logs -f api"
