#!/usr/bin/env bash
set -euo pipefail

: "${API_PUBLIC_URL:?}"
: "${WEB_PUBLIC_URL:?}"

echo "== Healthz checks =="
curl -fsS "${API_PUBLIC_URL}/healthz" | jq .
curl -fsS "${WEB_PUBLIC_URL}/" | head -1

echo "== Creating a smoke job =="
JOB_ID=$(curl -fsS -X POST "${API_PUBLIC_URL}/api/jobs" \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com","intent":"smoke test","duration":10}' \
  | jq -r .jobId)
echo "Created job: $JOB_ID"

echo "== Polling job state (60s) =="
for i in $(seq 1 60); do
  STATE=$(curl -fsS "${API_PUBLIC_URL}/api/jobs/${JOB_ID}" | jq -r .status)
  echo "$i. $STATE"
  if [[ "$STATE" == "done" ]]; then
    echo "SMOKE PASSED — job reached 'done'"
    exit 0
  fi
  if [[ "$STATE" == "failed" ]]; then
    echo "SMOKE FAILED — job state=failed"
    curl -fsS "${API_PUBLIC_URL}/api/jobs/${JOB_ID}" | jq .
    exit 1
  fi
  sleep 1
done
echo "SMOKE TIMED OUT — last state=$STATE"
exit 2
