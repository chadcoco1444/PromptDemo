#!/usr/bin/env bash
set -euo pipefail

: "${GCP_PROJECT_ID:?}"
: "${GCP_REGION:?}"
: "${AR_REPO_LOCATION:?}"
: "${AR_REPO_NAME:?}"
: "${GCS_BUCKET_NAME:?}"

TAG="${1:-latest}"
REGISTRY="${AR_REPO_LOCATION}-docker.pkg.dev/${GCP_PROJECT_ID}/${AR_REPO_NAME}"
IMAGE_RENDER="${REGISTRY}/render:${TAG}"

REDIS_HOST=$(gcloud redis instances describe "${REDIS_INSTANCE_NAME:-lumespec-redis}" --region="$GCP_REGION" --format="value(host)")
REDIS_PORT=$(gcloud redis instances describe "${REDIS_INSTANCE_NAME:-lumespec-redis}" --region="$GCP_REGION" --format="value(port)")
export REDIS_HOST REDIS_PORT
export IMAGE_RENDER GCS_BUCKET_NAME GCP_PROJECT_ID GCP_REGION

# Substitute env vars in the service YAML and apply
envsubst < deploy/services/render.yaml > /tmp/render.yaml
gcloud run services replace /tmp/render.yaml --region="$GCP_REGION"

# Private worker: no allUsers invoker binding

URL=$(gcloud run services describe render --region="$GCP_REGION" --format="value(status.url)")
echo "render deployed at: $URL"
