#!/usr/bin/env bash
set -euo pipefail

: "${GCP_PROJECT_ID:?}"
: "${GCP_REGION:?}"
: "${AR_REPO_LOCATION:?}"
: "${AR_REPO_NAME:?}"
: "${GCS_BUCKET_NAME:?}"

TAG="${1:-latest}"
REGISTRY="${AR_REPO_LOCATION}-docker.pkg.dev/${GCP_PROJECT_ID}/${AR_REPO_NAME}"
IMAGE_API="${REGISTRY}/api:${TAG}"

REDIS_HOST=$(gcloud redis instances describe "${REDIS_INSTANCE_NAME:-lumespec-redis}" --region="$GCP_REGION" --format="value(host)")
REDIS_PORT=$(gcloud redis instances describe "${REDIS_INSTANCE_NAME:-lumespec-redis}" --region="$GCP_REGION" --format="value(port)")
export REDIS_HOST REDIS_PORT
export IMAGE_API GCS_BUCKET_NAME GCP_PROJECT_ID GCP_REGION

# Substitute env vars in the service YAML and apply
envsubst < deploy/services/api.yaml > /tmp/api.yaml
gcloud run services replace /tmp/api.yaml --region="$GCP_REGION"

# Public ingress: allow unauthenticated invocations
gcloud run services add-iam-policy-binding api \
  --region="$GCP_REGION" \
  --member=allUsers \
  --role=roles/run.invoker

URL=$(gcloud run services describe api --region="$GCP_REGION" --format="value(status.url)")
echo "api deployed at: $URL"
