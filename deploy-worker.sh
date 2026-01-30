#!/bin/bash
set -e

echo "=== Deploying RareGen Worker ==="

# Build locally
echo "Building TypeScript..."
npm run build

# Create deployment tarball
echo "Creating tarball..."
tar czf worker-deploy.tar.gz \
  dist/ \
  package.json \
  package-lock.json \
  Dockerfile \
  docker-compose.yml \
  .env

# Copy to server
echo "Copying to server..."
scp worker-deploy.tar.gz root@167.99.179.216:/tmp/

# Extract and rebuild on server
echo "Deploying on server..."
ssh root@167.99.179.216 'bash -s' << 'EOF'
set -e

cd /opt/raregen

# Extract tarball
echo "Extracting files..."
tar xzf /tmp/worker-deploy.tar.gz
rm /tmp/worker-deploy.tar.gz

# Stop old worker
echo "Stopping old worker..."
docker-compose stop worker 2>/dev/null || true
docker-compose rm -f worker 2>/dev/null || true

# Remove old image
echo "Removing old image..."
docker image rm raregen_worker:latest 2>/dev/null || true

# Build new image (fast - uses existing dist/)
echo "Building new image..."
docker-compose build worker

# Start worker
echo "Starting worker..."
docker-compose up -d worker

# Show status
sleep 5
echo "=== Worker Status ==="
docker-compose ps worker
echo ""
echo "=== Worker Logs (last 30 lines) ==="
docker-compose logs --tail=30 worker

EOF

echo ""
echo "✅ Deployment complete!"
echo "Run: ssh root@167.99.179.216 'cd /opt/raregen && docker-compose logs -f worker'"
