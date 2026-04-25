#!/usr/bin/env bash
set -euo pipefail

: "${GCP_PROJECT_ID:?}"
: "${GCP_REGION:?}"
: "${AR_REPO_LOCATION:?}"
: "${AR_REPO_NAME:?}"
: "${GCS_BUCKET_NAME:?}"

TAG="${1:-latest}"
REGISTRY="${AR_REPO_LOCATION}-docker.pkg.dev/${GCP_PROJECT_ID}/${AR_REPO_NAME}"
IMAGE_CRAWLER="${REGISTRY}/crawler:${TAG}"

REDIS_HOST=$(gcloud redis instances describe "${REDIS_INSTANCE_NAME:-lumespec-redis}" --region="$GCP_REGION" --format="value(host)")
REDIS_PORT=$(gcloud redis instances describe "${REDIS_INSTANCE_NAME:-lumespec-redis}" --region="$GCP_REGION" --format="value(port)")
export REDIS_HOST REDIS_PORT
export IMAGE_CRAWLER GCS_BUCKET_NAME GCP_PROJECT_ID GCP_REGION

# Substitute env vars in the service YAML and apply
envsubst < deploy/services/crawler.yaml > /tmp/crawler.yaml
gcloud run services replace /tmp/crawler.yaml --region="$GCP_REGION"

# Private worker: no allUsers invoker binding

URL=$(gcloud run services describe crawler --region="$GCP_REGION" --format="value(status.url)")
echo "crawler deployed at: $URL"
