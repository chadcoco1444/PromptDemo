#!/usr/bin/env bash
set -euo pipefail

: "${GCP_PROJECT_ID:?}"
: "${GCP_REGION:=us-central1}"
: "${REDIS_INSTANCE_NAME:=lumespec-redis}"
: "${REDIS_TIER:=BASIC}"           # BASIC (no HA) for MVP; STANDARD_HA for prod
: "${REDIS_SIZE_GB:=1}"

if gcloud redis instances describe "$REDIS_INSTANCE_NAME" --region="$GCP_REGION" >/dev/null 2>&1; then
  echo "Redis instance '$REDIS_INSTANCE_NAME' already exists."
else
  gcloud redis instances create "$REDIS_INSTANCE_NAME" \
    --size="$REDIS_SIZE_GB" \
    --region="$GCP_REGION" \
    --tier="$REDIS_TIER" \
    --redis-version=redis_7_0
fi

HOST=$(gcloud redis instances describe "$REDIS_INSTANCE_NAME" --region="$GCP_REGION" --format="value(host)")
PORT=$(gcloud redis instances describe "$REDIS_INSTANCE_NAME" --region="$GCP_REGION" --format="value(port)")
NETWORK=$(gcloud redis instances describe "$REDIS_INSTANCE_NAME" --region="$GCP_REGION" --format="value(authorizedNetwork)")

echo ""
echo "Redis ready. Cloud Run services reach it via the Serverless VPC Connector."
echo "  Host: ${HOST}"
echo "  Port: ${PORT}"
echo "  Network: ${NETWORK}"
echo ""
echo "NOTE: Cloud Run needs a Serverless VPC Connector in this network to reach Memorystore."
echo "See DEPLOYMENT.md for the one-time connector create command."
