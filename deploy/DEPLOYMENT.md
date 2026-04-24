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

## Cost preview (us-central1, fair-use)

| Resource | Tier | ~USD/month |
|---|---|---|
| Memorystore Redis Standard 1GB | Basic tier, 1GB | ~$35 |
| GCS Standard (10GB usage) | incl. egress | ~$3 |
| Cloud Run `web` / `api` | min 0 / min 1 | $5–30 |
| Cloud Run workers (crawler/storyboard/render) | scale-to-zero | $10–60 (render dominant) |
| Secret Manager | 6 secrets | <$1 |
| Artifact Registry | 6 images × 500MB | ~$5 |
| **Total estimated idle** | | **~$50/month** |
| **Total under light demo traffic** | | **~$100–150/month** |

Tune `min-instances` and `max-instances` per service to shape cost.

## Workload Identity Federation (one-time setup)

The GitHub Actions workflow in `.github/workflows/deploy.yaml` authenticates to
GCP via Workload Identity Federation (WIF) — no long-lived service account
keys. This requires a one-time setup on GCP: create a Workload Identity Pool,
add a GitHub OIDC provider, and bind a deploy service account with the roles
needed to push images and deploy Cloud Run services (Artifact Registry Writer,
Cloud Run Admin, Service Account User, Secret Manager Secret Accessor).

Follow the canonical setup guide in the official action README:
https://github.com/google-github-actions/auth

After setup, configure the following in the GitHub repo settings:

- **Secrets**: `GCP_WIF_PROVIDER` (full provider resource name),
  `GCP_DEPLOY_SA` (deploy service account email)
- **Variables**: `GCP_PROJECT_ID`, `GCP_REGION`, `AR_REPO_NAME`,
  `GCS_BUCKET_NAME`, `REDIS_HOST`, `REDIS_PORT`, `API_PUBLIC_URL`,
  `WEB_PUBLIC_URL`

## Troubleshooting

### Redis connection timeouts from Cloud Run

Symptom: workers log `ETIMEDOUT` or `ECONNREFUSED` connecting to
`redis://10.x.x.x:6379`.

Cause: Cloud Run service is missing the Serverless VPC Connector, or the
connector is in a different network than the Memorystore instance.

Fix: confirm `run.googleapis.com/vpc-access-connector` annotation in the
service YAML points to `projects/$GCP_PROJECT_ID/locations/$GCP_REGION/connectors/promptdemo-connector`,
and that the connector and Memorystore share the same `authorizedNetwork`
(typically `default`). Re-run `gcloud run services replace` after fixing.

### GCS IAM: 403 AccessDenied on object writes

Symptom: crawler/storyboard/render log `AccessDenied` when uploading to the
bucket.

Cause: per-service service account missing `roles/storage.objectAdmin` on the
bucket, or using HMAC keys from a service account without the role.

Fix: re-run `./deploy/scripts/05-service-accounts.sh` (idempotent). Verify
with:

```bash
gcloud storage buckets get-iam-policy "gs://$GCS_BUCKET_NAME"
```

The HMAC keypair is tied to the `promptdemo-storage` service account — if you
rotate HMAC keys, the new key inherits that SA's roles.

### Cloud Run quota: `CPU allocation exceeded`

Symptom: `gcloud run services replace` fails with quota error (typically on
`render` with 4 vCPU).

Cause: default regional Cloud Run quota is lower than the sum of `max-instances`
× CPU across services.

Fix: request a quota increase via the GCP console
(IAM & Admin → Quotas → Cloud Run API → CPU allocation), or temporarily lower
`autoscaling.knative.dev/maxScale` in `deploy/services/render.yaml`.

### Chromium OOM in render worker

Symptom: render worker crashes with `Aw, snap!` or exits 137 mid-render; Cloud
Logging shows container memory at 100%.

Cause: Remotion's headless Chromium spikes memory on long videos or high
resolutions. Default 4Gi limit in `render.yaml` may be insufficient.

Fix: bump `resources.limits.memory` in `deploy/services/render.yaml` to `8Gi`
and redeploy. Also verify `run.googleapis.com/execution-environment: gen2` is
set — gen1 has a lower effective memory ceiling for Chromium.

## Ops

### Tailing logs

```bash
# Live tail a single service
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="render"' \
  --limit=50 --format="value(timestamp,textPayload)" --order=desc

# Follow errors across all services for the last 10 minutes
gcloud logging read \
  'resource.type="cloud_run_revision" AND severity>=ERROR AND timestamp>="'"$(date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%SZ)"'"' \
  --format="value(timestamp,resource.labels.service_name,textPayload)"
```

### Rollback to a prior revision

List revisions, then shift 100% of traffic:

```bash
gcloud run revisions list --service=api --region="$GCP_REGION"

gcloud run services update-traffic api \
  --region="$GCP_REGION" \
  --to-revisions=api-00042-abc=100
```

Revision names are immutable — rollback is zero-downtime and reversible by
pointing traffic back at the newer revision.
