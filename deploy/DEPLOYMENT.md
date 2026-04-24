# PromptDemo Deployment Runbook

Target: GCP Cloud Run + Memorystore + GCS (S3-compat).

## Prerequisites

- `gcloud` CLI authenticated with Owner or equivalent roles
- Node 20 + pnpm 9 for local image builds (falls back to Cloud Build)
- A billing-enabled GCP project
- `ANTHROPIC_API_KEY` available
- Optional: `SCREENSHOTONE_ACCESS_KEY` if you want the crawler's rescue track

## First deploy (run once in order)

```bash
cp deploy/.env.deploy.example deploy/.env.deploy
# fill in GCP_PROJECT_ID, ANTHROPIC_API_KEY, (optional) SCREENSHOTONE_ACCESS_KEY

set -a; source deploy/.env.deploy; set +a

./deploy/scripts/00-setup-project.sh
./deploy/scripts/01-artifact-registry.sh
./deploy/scripts/02-gcs-bucket.sh         # writes HMAC creds back to .env.deploy
./deploy/scripts/03-memorystore.sh
./deploy/scripts/05-service-accounts.sh
./deploy/scripts/04-secrets.sh
./deploy/scripts/10-build-and-push.sh
./deploy/scripts/20-deploy-web.sh
./deploy/scripts/20-deploy-api.sh
./deploy/scripts/20-deploy-crawler.sh
./deploy/scripts/20-deploy-storyboard.sh
./deploy/scripts/20-deploy-render.sh
./deploy/scripts/30-smoke.sh
```

## Recurring deploys

Push a tag matching `v*.*.*-deploy` — GitHub Actions rebuilds + redeploys all 5 services. See `.github/workflows/deploy.yaml`.

## Teardown

`./deploy/scripts/99-teardown.sh` removes everything provisioned. Will prompt to confirm.

## Serverless VPC Connector (one-time, for Redis access)

```bash
gcloud compute networks vpc-access connectors create promptdemo-connector \
  --region="$GCP_REGION" \
  --network=default \
  --range=10.8.0.0/28
```

Each worker service's deploy command passes `--vpc-connector=promptdemo-connector` so it can reach the Memorystore instance.
