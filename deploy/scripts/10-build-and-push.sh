#!/usr/bin/env bash
set -euo pipefail

: "${GCP_PROJECT_ID:?}"
: "${AR_REPO_LOCATION:?}"
: "${AR_REPO_NAME:?}"

REGISTRY="${AR_REPO_LOCATION}-docker.pkg.dev/${GCP_PROJECT_ID}/${AR_REPO_NAME}"
TAG="${1:-latest}"

declare -A DOCKERFILES=(
  [web]=apps/web/Dockerfile
  [api]=apps/api/Dockerfile
  [crawler]=workers/crawler/Dockerfile
  [storyboard]=workers/storyboard/Dockerfile
  [render]=workers/render/Dockerfile
)

for svc in "${!DOCKERFILES[@]}"; do
  IMAGE="${REGISTRY}/${svc}:${TAG}"
  echo "Building $svc -> $IMAGE"
  docker build -f "${DOCKERFILES[$svc]}" -t "$IMAGE" .
  docker push "$IMAGE"
done

echo "All 5 images pushed."
