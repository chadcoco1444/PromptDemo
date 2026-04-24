#!/usr/bin/env bash
set -euo pipefail

: "${GCP_PROJECT_ID:?}"
: "${GCP_REGION:?}"
: "${GCS_BUCKET_NAME:?}"
: "${REDIS_INSTANCE_NAME:=promptdemo-redis}"
: "${AR_REPO_NAME:=promptdemo}"

read -p "Nuke all PromptDemo resources in project $GCP_PROJECT_ID? (type YES) " ack
[[ "$ack" == "YES" ]] || { echo "Aborted."; exit 1; }

for svc in web api crawler storyboard render; do
  gcloud run services delete "$svc" --region="$GCP_REGION" --quiet || true
done

gcloud redis instances delete "$REDIS_INSTANCE_NAME" --region="$GCP_REGION" --quiet || true
gcloud storage rm -r "gs://${GCS_BUCKET_NAME}" || true
gcloud artifacts repositories delete "$AR_REPO_NAME" --location="$GCP_REGION" --quiet || true

for sa in web api crawler storyboard render storage; do
  gcloud iam service-accounts delete "promptdemo-${sa}@${GCP_PROJECT_ID}.iam.gserviceaccount.com" --quiet || true
done

for secret in anthropic-api-key gcs-hmac-access-id gcs-hmac-secret screenshotone-access-key; do
  gcloud secrets delete "$secret" --quiet || true
done

gcloud compute networks vpc-access connectors delete promptdemo-connector --region="$GCP_REGION" --quiet || true

echo "Teardown complete."
