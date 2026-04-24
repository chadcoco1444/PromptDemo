#!/usr/bin/env bash
set -euo pipefail

: "${GCP_PROJECT_ID:?}"
: "${GCP_REGION:?}"
: "${AR_REPO_LOCATION:?}"
: "${AR_REPO_NAME:?}"
: "${API_PUBLIC_URL:=https://api-replace-me.run.app}"

TAG="${1:-latest}"
REGISTRY="${AR_REPO_LOCATION}-docker.pkg.dev/${GCP_PROJECT_ID}/${AR_REPO_NAME}"
IMAGE_WEB="${REGISTRY}/web:${TAG}"
export IMAGE_WEB API_PUBLIC_URL

# Substitute env vars in the service YAML and apply
envsubst < deploy/services/web.yaml > /tmp/web.yaml
gcloud run services replace /tmp/web.yaml --region="$GCP_REGION"

# Public ingress: allow unauthenticated invocations
gcloud run services add-iam-policy-binding web \
  --region="$GCP_REGION" \
  --member=allUsers \
  --role=roles/run.invoker

URL=$(gcloud run services describe web --region="$GCP_REGION" --format="value(status.url)")
echo "web deployed at: $URL"
