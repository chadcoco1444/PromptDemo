#!/usr/bin/env bash
set -euo pipefail

: "${GCP_PROJECT_ID:?}"

SERVICES=(web api crawler storyboard render)

for svc in "${SERVICES[@]}"; do
  EMAIL="lumespec-${svc}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
  if ! gcloud iam service-accounts describe "$EMAIL" >/dev/null 2>&1; then
    gcloud iam service-accounts create "lumespec-${svc}" \
      --display-name="LumeSpec ${svc}"
  fi
done

# Storage SA already created by 02-gcs-bucket.sh. Grant per-service access:
STORAGE_BUCKET="${GCS_BUCKET_NAME:-lumespec-prod}"

# web: no GCS access (it's a pure frontend)
# api: read GCS (storyboard + video artifacts for debug endpoint)
gcloud storage buckets add-iam-policy-binding "gs://${STORAGE_BUCKET}" \
  --member="serviceAccount:lumespec-api@${GCP_PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/storage.objectViewer"
# crawler, storyboard, render: full object access (create + read + sign)
for svc in crawler storyboard render; do
  gcloud storage buckets add-iam-policy-binding "gs://${STORAGE_BUCKET}" \
    --member="serviceAccount:lumespec-${svc}@${GCP_PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/storage.objectAdmin"
done

echo "Service accounts provisioned."
