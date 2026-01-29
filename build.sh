#!/bin/bash
# Build and push Docker image

set -e

IMAGE_NAME="raregen-publisher"
REGISTRY="${REGISTRY:-docker.io/codenlighten}"
TAG="${TAG:-latest}"

echo "Building Docker image: ${REGISTRY}/${IMAGE_NAME}:${TAG}"

docker build -t "${REGISTRY}/${IMAGE_NAME}:${TAG}" .

if [ "$PUSH" = "true" ]; then
  echo "Pushing to registry..."
  docker push "${REGISTRY}/${IMAGE_NAME}:${TAG}"
  echo "✓ Image pushed: ${REGISTRY}/${IMAGE_NAME}:${TAG}"
else
  echo "✓ Image built: ${REGISTRY}/${IMAGE_NAME}:${TAG}"
  echo "Run with PUSH=true to push to registry"
fi
