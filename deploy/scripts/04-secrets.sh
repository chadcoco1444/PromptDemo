#!/usr/bin/env bash
set -euo pipefail

: "${GCP_PROJECT_ID:?}"
: "${ANTHROPIC_API_KEY:?}"
: "${GCS_HMAC_ACCESS_ID:?}"
: "${GCS_HMAC_SECRET:?}"

SCREENSHOTONE_ACCESS_KEY="${SCREENSHOTONE_ACCESS_KEY:-}"

push_secret() {
  local NAME=$1
  local VALUE=$2
  if gcloud secrets describe "$NAME" >/dev/null 2>&1; then
    echo "Updating $NAME..."
    printf "%s" "$VALUE" | gcloud secrets versions add "$NAME" --data-file=-
  else
    echo "Creating $NAME..."
    printf "%s" "$VALUE" | gcloud secrets create "$NAME" --replication-policy=automatic --data-file=-
  fi
}

push_secret anthropic-api-key "$ANTHROPIC_API_KEY"
push_secret gcs-hmac-access-id "$GCS_HMAC_ACCESS_ID"
push_secret gcs-hmac-secret "$GCS_HMAC_SECRET"

if [[ -n "$SCREENSHOTONE_ACCESS_KEY" ]]; then
  push_secret screenshotone-access-key "$SCREENSHOTONE_ACCESS_KEY"
fi

# Grant each service SA access to its secrets
grant() {
  local SECRET=$1; local SA=$2
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --member="serviceAccount:${SA}@${GCP_PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
}

grant gcs-hmac-access-id promptdemo-crawler
grant gcs-hmac-secret    promptdemo-crawler
grant gcs-hmac-access-id promptdemo-storyboard
grant gcs-hmac-secret    promptdemo-storyboard
grant gcs-hmac-access-id promptdemo-render
grant gcs-hmac-secret    promptdemo-render
grant gcs-hmac-access-id promptdemo-api
grant gcs-hmac-secret    promptdemo-api
grant anthropic-api-key  promptdemo-storyboard

if [[ -n "$SCREENSHOTONE_ACCESS_KEY" ]]; then
  grant screenshotone-access-key promptdemo-crawler
fi

echo "Secrets provisioned + IAM bindings granted."
