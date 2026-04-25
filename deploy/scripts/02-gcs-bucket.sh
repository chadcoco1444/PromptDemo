#!/usr/bin/env bash
set -euo pipefail

: "${GCP_PROJECT_ID:?}"
: "${GCS_BUCKET_NAME:?}"
: "${GCP_REGION:=us-central1}"

if gcloud storage buckets describe "gs://${GCS_BUCKET_NAME}" >/dev/null 2>&1; then
  echo "Bucket gs://${GCS_BUCKET_NAME} already exists."
else
  gcloud storage buckets create "gs://${GCS_BUCKET_NAME}" \
    --location="${GCP_REGION}" \
    --uniform-bucket-level-access
fi

echo "Generating HMAC keys for S3-interop access (one-time)..."
SA_EMAIL="lumespec-storage@${GCP_PROJECT_ID}.iam.gserviceaccount.com"

if ! gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1; then
  gcloud iam service-accounts create lumespec-storage \
    --display-name="LumeSpec S3-interop service account"
fi

gcloud storage buckets add-iam-policy-binding "gs://${GCS_BUCKET_NAME}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/storage.objectAdmin"

# Create HMAC key pair; output captured for writing back to .env.deploy
OUTPUT=$(gcloud storage hmac create "$SA_EMAIL" --format="value(accessId,secret)")
ACCESS_ID=$(echo "$OUTPUT" | cut -f1)
SECRET=$(echo "$OUTPUT" | cut -f2)

echo ""
echo "HMAC key created. APPEND these to deploy/.env.deploy (or regenerate the key if rotation needed):"
echo ""
echo "GCS_HMAC_ACCESS_ID=${ACCESS_ID}"
echo "GCS_HMAC_SECRET=${SECRET}"
echo ""
echo "Also SAVE these securely — the secret cannot be retrieved again from gcloud."
