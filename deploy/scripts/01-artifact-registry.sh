#!/usr/bin/env bash
set -euo pipefail

: "${GCP_PROJECT_ID:?}"
: "${AR_REPO_LOCATION:=us-central1}"
: "${AR_REPO_NAME:=promptdemo}"

if gcloud artifacts repositories describe "$AR_REPO_NAME" --location="$AR_REPO_LOCATION" >/dev/null 2>&1; then
  echo "Artifact Registry repo '$AR_REPO_NAME' already exists in $AR_REPO_LOCATION."
  exit 0
fi

gcloud artifacts repositories create "$AR_REPO_NAME" \
  --repository-format=docker \
  --location="$AR_REPO_LOCATION" \
  --description="PromptDemo container images"

gcloud auth configure-docker "${AR_REPO_LOCATION}-docker.pkg.dev" --quiet

echo "Repo URL: ${AR_REPO_LOCATION}-docker.pkg.dev/${GCP_PROJECT_ID}/${AR_REPO_NAME}"
