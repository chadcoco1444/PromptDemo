#!/usr/bin/env bash
set -euo pipefail

: "${GCP_PROJECT_ID:?}"
: "${GCP_REGION:=us-central1}"

echo "Setting active project: $GCP_PROJECT_ID"
gcloud config set project "$GCP_PROJECT_ID"
gcloud config set run/region "$GCP_REGION"

REQUIRED_APIS=(
  artifactregistry.googleapis.com
  cloudbuild.googleapis.com
  run.googleapis.com
  redis.googleapis.com
  storage.googleapis.com
  secretmanager.googleapis.com
  iam.googleapis.com
  logging.googleapis.com
)

for api in "${REQUIRED_APIS[@]}"; do
  echo "Enabling $api..."
  gcloud services enable "$api"
done

echo "Done. Confirm active account has roles: Owner or (Cloud Run Admin + Service Usage Admin + Storage Admin + Secret Manager Admin + IAM Admin + Artifact Registry Admin)."
