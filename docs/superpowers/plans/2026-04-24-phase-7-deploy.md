# LumeSpec v1.0 — Plan 7: Docker + Cloud Run Deploy

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Many tasks here create cloud resources — **confirm with user before running any `gcloud` command that provisions billable resources**.

**Goal:** Deploy all 6 LumeSpec packages (web, api, crawler, storyboard, render + shared schema) to GCP Cloud Run with Memorystore Redis, GCS (S3-compat interop mode), Artifact Registry, and Secret Manager. Ship a reproducible deploy script + GitHub Actions workflow so future tags auto-deploy.

**Architecture:** 5 Cloud Run services — `web` and `api` are public HTTP; `crawler`, `storyboard`, `render` are "worker" services that run a BullMQ loop plus a minimal HTTP health endpoint (Cloud Run requires HTTP; the health endpoint is just a liveness signal, the real work is queue-driven). All services share one Memorystore Redis and one GCS bucket. Each service has a dedicated IAM service account with least-privilege roles.

**Tech Stack:** gcloud CLI (imperative, checked-in scripts), Cloud Run, Cloud Build, Artifact Registry, Memorystore for Redis, GCS (S3-compat via interoperability mode), Secret Manager, Cloud Logging, GitHub Actions.

**Spec reference:** `docs/superpowers/specs/2026-04-20-lumespec-design.md` §1.

**Predecessors:** All prior plans (`v0.1.0` through `v0.6.0`). Plan 7 tags `v1.0.0-mvp` when deployed and smoke-tested.

**Billing disclaimer:** Every provisioning task either prints the command first (dry-run) or asks the user for explicit confirmation. Idempotent where possible — re-running a task against existing resources is a no-op. Tasks 7.1–7.5 provision billable resources; 7.6–7.7 are code changes; 7.8–7.12 deploy + validate.

---

## Cost Preview (us-central1, fair-use)

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

---

## File Structure

```
deploy/
├── .env.deploy.example             # per-env secret list + default values
├── scripts/
│   ├── 00-setup-project.sh         # enable APIs, set project
│   ├── 01-artifact-registry.sh     # create docker repo
│   ├── 02-gcs-bucket.sh            # create bucket + HMAC keys
│   ├── 03-memorystore.sh           # create Redis instance
│   ├── 04-secrets.sh               # push secrets to Secret Manager
│   ├── 05-service-accounts.sh      # create SAs + IAM bindings
│   ├── 10-build-and-push.sh        # build + push all 5 images
│   ├── 20-deploy-web.sh
│   ├── 20-deploy-api.sh
│   ├── 20-deploy-crawler.sh
│   ├── 20-deploy-storyboard.sh
│   ├── 20-deploy-render.sh
│   ├── 30-smoke.sh                 # post-deploy canary
│   └── 99-teardown.sh              # nuke all provisioned resources
├── services/
│   ├── web.yaml                    # Cloud Run service manifest
│   ├── api.yaml
│   ├── crawler.yaml
│   ├── storyboard.yaml
│   └── render.yaml
└── DEPLOYMENT.md                    # runbook: end-to-end first deploy + recurring ops

.github/workflows/
└── deploy.yaml                      # triggered on tags matching v*.*.*-deploy

workers/<name>/src/health.ts         # added in Task 7.6 (3 files)
workers/render/src/presignedRewrite.ts  # added in Task 7.7
```

---

## Tasks Overview

12 tasks. Tasks 7.1–7.5 are one-time infra provisioning (run manually on first deploy). Task 7.6–7.7 are code changes (reviewable diffs). Tasks 7.8–7.11 automate deploy. Task 7.12 tags v1.0.0 after a clean smoke.

| # | Task | Type | Scope |
|---|---|---|---|
| 7.1 | Project setup + API enablement | script | `00-setup-project.sh` + `DEPLOYMENT.md` section |
| 7.2 | Artifact Registry repo | script | `01-artifact-registry.sh` |
| 7.3 | GCS bucket + HMAC keys | script | `02-gcs-bucket.sh` |
| 7.4 | Memorystore Redis | script | `03-memorystore.sh` |
| 7.5 | Secret Manager + service accounts | script | `04-secrets.sh`, `05-service-accounts.sh` |
| 7.6 | Worker health endpoints | code | tiny HTTP server in each worker |
| 7.7 | Pre-signed URL support in render | code | storyboard URI rewrite before Remotion handoff |
| 7.8 | Cloud Run service YAMLs | infra | 5 manifests in `deploy/services/` |
| 7.9 | Build + deploy scripts | script | `10-build-and-push.sh`, `20-deploy-*.sh` |
| 7.10 | GitHub Actions deploy workflow | CI | `.github/workflows/deploy.yaml` |
| 7.11 | Smoke test + DEPLOYMENT.md | script + docs | `30-smoke.sh` + full runbook |
| 7.12 | Execute first deploy + tag v1.0.0-mvp | ops | end-to-end validation |

---

## Phase 7 — Tasks

### Task 7.1: Project setup + API enablement

**Files:**
- Create: `deploy/scripts/00-setup-project.sh`
- Create: `deploy/DEPLOYMENT.md` (initial skeleton)
- Create: `deploy/.env.deploy.example`

- [ ] **Step 1: `00-setup-project.sh`**

```bash
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
```

- [ ] **Step 2: `.env.deploy.example`**

```
# Copy to deploy/.env.deploy (gitignored) and fill in:
GCP_PROJECT_ID=
GCP_REGION=us-central1
GCS_BUCKET_NAME=lumespec-prod
REDIS_INSTANCE_NAME=lumespec-redis
AR_REPO_NAME=lumespec
AR_REPO_LOCATION=us-central1

# Will be populated by 02-gcs-bucket.sh — do NOT fill in manually:
GCS_HMAC_ACCESS_ID=
GCS_HMAC_SECRET=

# Secrets that 04-secrets.sh will push to Secret Manager:
ANTHROPIC_API_KEY=
SCREENSHOTONE_ACCESS_KEY=
```

Append to `.gitignore`:
```
deploy/.env.deploy
```

- [ ] **Step 3: `DEPLOYMENT.md` skeleton**

```markdown
# LumeSpec Deployment Runbook

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
```

- [ ] **Step 4: Commit**

```bash
chmod +x deploy/scripts/*.sh 2>/dev/null || true
git add deploy/ .gitignore
git commit -m "chore(deploy): scaffold GCP deploy scripts + DEPLOYMENT.md"
```

No push.

---

### Task 7.2: Artifact Registry repo

**Files:**
- Create: `deploy/scripts/01-artifact-registry.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

: "${GCP_PROJECT_ID:?}"
: "${AR_REPO_LOCATION:=us-central1}"
: "${AR_REPO_NAME:=lumespec}"

if gcloud artifacts repositories describe "$AR_REPO_NAME" --location="$AR_REPO_LOCATION" >/dev/null 2>&1; then
  echo "Artifact Registry repo '$AR_REPO_NAME' already exists in $AR_REPO_LOCATION."
  exit 0
fi

gcloud artifacts repositories create "$AR_REPO_NAME" \
  --repository-format=docker \
  --location="$AR_REPO_LOCATION" \
  --description="LumeSpec container images"

gcloud auth configure-docker "${AR_REPO_LOCATION}-docker.pkg.dev" --quiet

echo "Repo URL: ${AR_REPO_LOCATION}-docker.pkg.dev/${GCP_PROJECT_ID}/${AR_REPO_NAME}"
```

Commit: `feat(deploy): artifact registry provisioning script`

---

### Task 7.3: GCS bucket + HMAC keys

**Files:**
- Create: `deploy/scripts/02-gcs-bucket.sh`

```bash
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
```

Commit: `feat(deploy): GCS bucket + HMAC key provisioning script`

---

### Task 7.4: Memorystore Redis

**Files:**
- Create: `deploy/scripts/03-memorystore.sh`

```bash
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
```

Amendment to `DEPLOYMENT.md`:

```markdown
## Serverless VPC Connector (one-time, for Redis access)

```bash
gcloud compute networks vpc-access connectors create lumespec-connector \
  --region="$GCP_REGION" \
  --network=default \
  --range=10.8.0.0/28
```

Each worker service's deploy command passes `--vpc-connector=lumespec-connector` so it can reach the Memorystore instance.
```

Commit: `feat(deploy): Memorystore Redis provisioning + VPC connector docs`

---

### Task 7.5: Secret Manager + service accounts

**Files:**
- Create: `deploy/scripts/04-secrets.sh`
- Create: `deploy/scripts/05-service-accounts.sh`

- [ ] **Step 1: `05-service-accounts.sh`** (run before `04-secrets.sh` so SAs exist to grant access)

```bash
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
```

- [ ] **Step 2: `04-secrets.sh`**

```bash
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

grant gcs-hmac-access-id lumespec-crawler
grant gcs-hmac-secret    lumespec-crawler
grant gcs-hmac-access-id lumespec-storyboard
grant gcs-hmac-secret    lumespec-storyboard
grant gcs-hmac-access-id lumespec-render
grant gcs-hmac-secret    lumespec-render
grant gcs-hmac-access-id lumespec-api
grant gcs-hmac-secret    lumespec-api
grant anthropic-api-key  lumespec-storyboard

if [[ -n "$SCREENSHOTONE_ACCESS_KEY" ]]; then
  grant screenshotone-access-key lumespec-crawler
fi

echo "Secrets provisioned + IAM bindings granted."
```

Commit: `feat(deploy): secret manager + service account provisioning`

---

### Task 7.6: Worker health endpoints

**Purpose:** Cloud Run services require an HTTP listener on `$PORT`. Workers currently have no HTTP; add a tiny liveness server alongside the BullMQ worker. 10 lines per service.

**Files:**
- Create: `workers/crawler/src/health.ts`
- Create: `workers/storyboard/src/health.ts`
- Create: `workers/render/src/health.ts`
- Modify: 3 worker `src/index.ts` files to call `startHealthServer()`

- [ ] **Step 1: Shared health server template** (identical content in all 3 files — justified by workspace independence)

```ts
import { createServer } from 'node:http';

export function startHealthServer(port: number = Number(process.env.PORT) || 8080): void {
  const server = createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  server.listen(port, '0.0.0.0', () => {
    console.log(`[health] listening on :${port}`);
  });
}
```

- [ ] **Step 2: Wire into each worker's `src/index.ts`**

Add near the top of each worker bootstrap:
```ts
import { startHealthServer } from './health.js';
// ...
startHealthServer();
```

(Remember post-Plan-1 the workspace uses `moduleResolution: Bundler` → the `.js` suffix is optional. Either form works; keep consistent with existing file.)

- [ ] **Step 3: Verify typecheck still passes**

```bash
pnpm -r typecheck
```

- [ ] **Step 4: Commit**

```bash
git add workers/crawler/src/health.ts workers/storyboard/src/health.ts workers/render/src/health.ts \
       workers/crawler/src/index.ts workers/storyboard/src/index.ts workers/render/src/index.ts
git commit -m "feat(workers): minimal /healthz HTTP server for Cloud Run liveness"
```

No push.

---

### Task 7.7: Pre-signed URL support in render worker

**Purpose:** In dev, MinIO's `anonymous set download` lets Remotion's headless Chromium fetch `s3://` URIs via path-style HTTP. In prod, the GCS bucket is private — Remotion's Chromium cannot authenticate. Fix: before handing the storyboard to Remotion, walk all `s3://` URIs and replace them with V4 pre-signed HTTPS URLs (short TTL, 30 minutes).

**Files:**
- Create: `workers/render/src/presignedRewrite.ts`
- Create: `workers/render/tests/presignedRewrite.test.ts`
- Modify: `workers/render/src/index.ts` to call the rewrite before `renderComposition`
- Modify: `workers/render/package.json` to add `@aws-sdk/s3-request-presigner@3.658.1`

- [ ] **Step 1: Test (TDD)**

```ts
import { describe, it, expect, vi } from 'vitest';
import { rewriteStoryboardUrls } from '../src/presignedRewrite.js';
import type { Storyboard } from '@lumespec/schema';

const sb = {
  videoConfig: {
    durationInFrames: 900,
    fps: 30,
    brandColor: '#111111',
    logoUrl: 's3://b/logo.png',
    bgm: 'none',
  },
  assets: {
    screenshots: {
      viewport: 's3://b/v.jpg',
      fullPage: 's3://b/full.jpg',
    },
    sourceTexts: ['x'],
  },
  scenes: [{
    sceneId: 1,
    type: 'TextPunch',
    durationInFrames: 900,
    entryAnimation: 'fade',
    exitAnimation: 'fade',
    props: { text: 'x', emphasis: 'primary' },
  }],
} as unknown as Storyboard;

describe('rewriteStoryboardUrls', () => {
  it('replaces every s3:// URI in videoConfig.logoUrl + screenshots', async () => {
    const sign = vi.fn().mockImplementation(async (uri: string) => `https://signed/${uri.slice(5)}`);
    const out = await rewriteStoryboardUrls(sb, sign);
    expect(out.videoConfig.logoUrl).toBe('https://signed/b/logo.png');
    expect((out.assets.screenshots as any).viewport).toBe('https://signed/b/v.jpg');
    expect((out.assets.screenshots as any).fullPage).toBe('https://signed/b/full.jpg');
    expect(sign).toHaveBeenCalledTimes(3);
  });

  it('handles storyboards with no screenshots / no logo (Tier B fallback)', async () => {
    const tierB = { ...sb, videoConfig: { ...sb.videoConfig, logoUrl: undefined }, assets: { ...sb.assets, screenshots: {} } };
    const sign = vi.fn();
    const out = await rewriteStoryboardUrls(tierB as any, sign);
    expect(sign).not.toHaveBeenCalled();
    expect(out.assets.screenshots).toEqual({});
  });
});
```

- [ ] **Step 2: Impl**

```ts
import type { Storyboard } from '@lumespec/schema';

export type UriSigner = (s3Uri: string) => Promise<string>;

type SignedStoryboard = Omit<Storyboard, 'assets' | 'videoConfig'> & {
  videoConfig: Omit<Storyboard['videoConfig'], 'logoUrl'> & { logoUrl?: string };
  assets: Omit<Storyboard['assets'], 'screenshots'> & {
    screenshots: { viewport?: string; fullPage?: string; byFeature?: Record<string, string> };
  };
};

export async function rewriteStoryboardUrls(
  sb: Storyboard,
  sign: UriSigner
): Promise<SignedStoryboard> {
  const out: SignedStoryboard = JSON.parse(JSON.stringify(sb));

  if (sb.videoConfig.logoUrl) {
    out.videoConfig.logoUrl = await sign(sb.videoConfig.logoUrl);
  }

  const src = sb.assets.screenshots;
  const dst = out.assets.screenshots;
  if (src.viewport) dst.viewport = await sign(src.viewport);
  if (src.fullPage) dst.fullPage = await sign(src.fullPage);
  if (src.byFeature) {
    dst.byFeature = {};
    for (const [k, v] of Object.entries(src.byFeature)) {
      dst.byFeature[k] = await sign(v);
    }
  }

  return out;
}

// Default signer using @aws-sdk/s3-request-presigner against the S3/GCS-interop endpoint
import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { parseS3Uri } from '@lumespec/schema';

export function defaultSigner(client: S3Client, ttlSeconds: number = 1800): UriSigner {
  return async (uri) => {
    const { bucket, key } = parseS3Uri(uri);
    return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: ttlSeconds });
  };
}
```

- [ ] **Step 3: Wire in `workers/render/src/index.ts`**

Near the top of the Worker callback, after loading + validating the storyboard, before calling `renderComposition`:

```ts
import { rewriteStoryboardUrls, defaultSigner } from './presignedRewrite.js';

// ... inside the Worker callback:
const signed = await rewriteStoryboardUrls(storyboard, defaultSigner(s3));
// Pass `signed` as the Storyboard portion of inputProps — the HTTPS URLs
// bypass Plan 3's makeS3Resolver (which no-ops when input is already http).
await renderComposition({
  // ...
  inputProps: {
    ...signed,
    sourceUrl: payload.sourceUrl,
    resolverEndpoint: s3Endpoint,   // still passed; resolver no-ops when URI is already https
    forcePathStyle,
  } as any, // cast: SignedStoryboard widens S3Uri to string
  // ...
});
```

Replace the older TODO comment about pre-signed URLs — it's no longer a TODO.

- [ ] **Step 4: Run tests + typecheck**

```bash
pnpm install   # new dep
pnpm --filter @lumespec/worker-render typecheck
pnpm --filter @lumespec/worker-render test
```

- [ ] **Step 5: Commit**

```bash
git add workers/render/src/presignedRewrite.ts workers/render/tests/presignedRewrite.test.ts \
       workers/render/src/index.ts workers/render/package.json pnpm-lock.yaml
git commit -m "feat(render): pre-signed URL rewrite for private S3/GCS buckets"
```

No push.

---

### Task 7.8: Cloud Run service YAMLs

**Files:**
- Create: `deploy/services/{web,api,crawler,storyboard,render}.yaml`

Each service YAML is a Cloud Run Service manifest. Values that depend on per-deploy settings (image tag, project ID) use `${VAR}` placeholders substituted by the deploy script.

- [ ] **Step 1: `deploy/services/web.yaml`**

```yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: web
  annotations:
    run.googleapis.com/ingress: all
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: "0"
        autoscaling.knative.dev/maxScale: "10"
    spec:
      serviceAccountName: lumespec-web@${GCP_PROJECT_ID}.iam.gserviceaccount.com
      containerConcurrency: 80
      timeoutSeconds: 60
      containers:
      - image: ${IMAGE_WEB}
        ports:
        - containerPort: 3001
        env:
        - name: PORT
          value: "3001"
        - name: NEXT_PUBLIC_API_BASE
          value: ${API_PUBLIC_URL}
        - name: NEXT_PUBLIC_S3_ENDPOINT
          value: https://storage.googleapis.com
        resources:
          limits:
            cpu: "1"
            memory: 512Mi
```

- [ ] **Step 2: `deploy/services/api.yaml`**

```yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: api
  annotations:
    run.googleapis.com/ingress: all
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: "1"      # keep warm for SSE
        autoscaling.knative.dev/maxScale: "10"
        run.googleapis.com/vpc-access-connector: projects/${GCP_PROJECT_ID}/locations/${GCP_REGION}/connectors/lumespec-connector
        run.googleapis.com/vpc-access-egress: private-ranges-only
    spec:
      serviceAccountName: lumespec-api@${GCP_PROJECT_ID}.iam.gserviceaccount.com
      containerConcurrency: 80
      timeoutSeconds: 3600                         # allow long-lived SSE
      containers:
      - image: ${IMAGE_API}
        ports:
        - containerPort: 3000
        env:
        - name: PORT
          value: "3000"
        - name: REDIS_URL
          value: redis://${REDIS_HOST}:${REDIS_PORT}
        - name: S3_ENDPOINT
          value: https://storage.googleapis.com
        - name: S3_REGION
          value: auto
        - name: S3_FORCE_PATH_STYLE
          value: "true"
        - name: S3_BUCKET
          value: ${GCS_BUCKET_NAME}
        - name: RATE_LIMIT_PER_MINUTE
          value: "10"
        - name: RENDER_QUEUE_CAP
          value: "20"
        - name: S3_ACCESS_KEY_ID
          valueFrom: { secretKeyRef: { name: gcs-hmac-access-id, key: latest } }
        - name: S3_SECRET_ACCESS_KEY
          valueFrom: { secretKeyRef: { name: gcs-hmac-secret, key: latest } }
        resources:
          limits:
            cpu: "1"
            memory: 512Mi
```

- [ ] **Step 3: `deploy/services/crawler.yaml`** (worker; sized per Plan 1 `CLOUD_RUN.md`)

```yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: crawler
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: "0"
        autoscaling.knative.dev/maxScale: "5"
        run.googleapis.com/cpu-throttling: "false"  # always-allocated CPU for BullMQ worker loop
        run.googleapis.com/vpc-access-connector: projects/${GCP_PROJECT_ID}/locations/${GCP_REGION}/connectors/lumespec-connector
        run.googleapis.com/execution-environment: gen2
        run.googleapis.com/startup-cpu-boost: "true"
    spec:
      serviceAccountName: lumespec-crawler@${GCP_PROJECT_ID}.iam.gserviceaccount.com
      containerConcurrency: 1
      timeoutSeconds: 600
      containers:
      - image: ${IMAGE_CRAWLER}
        ports:
        - containerPort: 8080
        env:
        - name: PORT
          value: "8080"
        - name: REDIS_URL
          value: redis://${REDIS_HOST}:${REDIS_PORT}
        - name: S3_ENDPOINT
          value: https://storage.googleapis.com
        - name: S3_REGION
          value: auto
        - name: S3_FORCE_PATH_STYLE
          value: "true"
        - name: S3_BUCKET
          value: ${GCS_BUCKET_NAME}
        - name: CRAWLER_RESCUE_ENABLED
          value: "true"
        - name: PLAYWRIGHT_TIMEOUT_MS
          value: "15000"
        - name: S3_ACCESS_KEY_ID
          valueFrom: { secretKeyRef: { name: gcs-hmac-access-id, key: latest } }
        - name: S3_SECRET_ACCESS_KEY
          valueFrom: { secretKeyRef: { name: gcs-hmac-secret, key: latest } }
        - name: SCREENSHOTONE_ACCESS_KEY
          valueFrom: { secretKeyRef: { name: screenshotone-access-key, key: latest, optional: true } }
        resources:
          limits:
            cpu: "2"
            memory: 2Gi
```

- [ ] **Step 4: `deploy/services/storyboard.yaml`**

```yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: storyboard
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: "0"
        autoscaling.knative.dev/maxScale: "3"
        run.googleapis.com/cpu-throttling: "false"
        run.googleapis.com/vpc-access-connector: projects/${GCP_PROJECT_ID}/locations/${GCP_REGION}/connectors/lumespec-connector
    spec:
      serviceAccountName: lumespec-storyboard@${GCP_PROJECT_ID}.iam.gserviceaccount.com
      containerConcurrency: 1
      timeoutSeconds: 300
      containers:
      - image: ${IMAGE_STORYBOARD}
        ports:
        - containerPort: 8080
        env:
        - name: PORT
          value: "8080"
        - name: REDIS_URL
          value: redis://${REDIS_HOST}:${REDIS_PORT}
        - name: S3_ENDPOINT
          value: https://storage.googleapis.com
        - name: S3_REGION
          value: auto
        - name: S3_FORCE_PATH_STYLE
          value: "true"
        - name: S3_BUCKET
          value: ${GCS_BUCKET_NAME}
        - name: CLAUDE_MODEL
          value: claude-sonnet-4-6
        - name: S3_ACCESS_KEY_ID
          valueFrom: { secretKeyRef: { name: gcs-hmac-access-id, key: latest } }
        - name: S3_SECRET_ACCESS_KEY
          valueFrom: { secretKeyRef: { name: gcs-hmac-secret, key: latest } }
        - name: ANTHROPIC_API_KEY
          valueFrom: { secretKeyRef: { name: anthropic-api-key, key: latest } }
        resources:
          limits:
            cpu: "1"
            memory: 1Gi
```

- [ ] **Step 5: `deploy/services/render.yaml`** (the biggest service — most CPU + memory)

```yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: render
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: "0"
        autoscaling.knative.dev/maxScale: "10"
        run.googleapis.com/cpu-throttling: "false"
        run.googleapis.com/vpc-access-connector: projects/${GCP_PROJECT_ID}/locations/${GCP_REGION}/connectors/lumespec-connector
        run.googleapis.com/execution-environment: gen2
        run.googleapis.com/startup-cpu-boost: "true"
    spec:
      serviceAccountName: lumespec-render@${GCP_PROJECT_ID}.iam.gserviceaccount.com
      containerConcurrency: 1
      timeoutSeconds: 600
      containers:
      - image: ${IMAGE_RENDER}
        ports:
        - containerPort: 8080
        env:
        - name: PORT
          value: "8080"
        - name: REDIS_URL
          value: redis://${REDIS_HOST}:${REDIS_PORT}
        - name: S3_ENDPOINT
          value: https://storage.googleapis.com
        - name: S3_REGION
          value: auto
        - name: S3_FORCE_PATH_STYLE
          value: "true"
        - name: S3_BUCKET
          value: ${GCS_BUCKET_NAME}
        - name: S3_ACCESS_KEY_ID
          valueFrom: { secretKeyRef: { name: gcs-hmac-access-id, key: latest } }
        - name: S3_SECRET_ACCESS_KEY
          valueFrom: { secretKeyRef: { name: gcs-hmac-secret, key: latest } }
        resources:
          limits:
            cpu: "4"
            memory: 4Gi
```

- [ ] **Step 6: Commit**

```bash
git add deploy/services/
git commit -m "feat(deploy): Cloud Run service manifests for 5 services"
```

---

### Task 7.9: Build + deploy scripts

**Files:**
- Create: `deploy/scripts/10-build-and-push.sh`
- Create: `deploy/scripts/20-deploy-web.sh` (and the 4 equivalents)

- [ ] **Step 1: `10-build-and-push.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

: "${GCP_PROJECT_ID:?}"
: "${AR_REPO_LOCATION:?}"
: "${AR_REPO_NAME:?}"

REGISTRY="${AR_REPO_LOCATION}-docker.pkg.dev/${GCP_PROJECT_ID}/${AR_REPO_NAME}"
TAG="${1:-latest}"

declare -A DOCKERFILES=(
  [web]=apps/web/Dockerfile
  [api]=apps/api/Dockerfile
  [crawler]=workers/crawler/Dockerfile
  [storyboard]=workers/storyboard/Dockerfile
  [render]=workers/render/Dockerfile
)

for svc in "${!DOCKERFILES[@]}"; do
  IMAGE="${REGISTRY}/${svc}:${TAG}"
  echo "Building $svc -> $IMAGE"
  docker build -f "${DOCKERFILES[$svc]}" -t "$IMAGE" .
  docker push "$IMAGE"
done

echo "All 5 images pushed."
```

- [ ] **Step 2: Example `20-deploy-web.sh`** (pattern repeats for the 4 others, parameterized)

```bash
#!/usr/bin/env bash
set -euo pipefail

: "${GCP_PROJECT_ID:?}"
: "${GCP_REGION:?}"
: "${AR_REPO_LOCATION:?}"
: "${AR_REPO_NAME:?}"
: "${API_PUBLIC_URL:=https://api-replace-me.run.app}"

TAG="${1:-latest}"
REGISTRY="${AR_REPO_LOCATION}-docker.pkg.dev/${GCP_PROJECT_ID}/${AR_REPO_NAME}"
IMAGE_WEB="${REGISTRY}/web:${TAG}"

# Substitute env vars in the service YAML and apply
envsubst < deploy/services/web.yaml > /tmp/web.yaml
gcloud run services replace /tmp/web.yaml --region="$GCP_REGION"

URL=$(gcloud run services describe web --region="$GCP_REGION" --format="value(status.url)")
echo "web deployed at: $URL"
```

For api/crawler/storyboard/render: same pattern with different IMAGE_* + `envsubst` source. Each also needs REDIS_HOST + REDIS_PORT exported (from `gcloud redis instances describe` output) before `envsubst`. The `api` script should also `allow-unauthenticated` so clients can reach it:

```bash
gcloud run services add-iam-policy-binding api \
  --region="$GCP_REGION" \
  --member=allUsers \
  --role=roles/run.invoker
```

Same for `web`.

Workers (`crawler`, `storyboard`, `render`) should NOT be publicly invokable — they only consume Redis. Omit the `add-iam-policy-binding` for them.

- [ ] **Step 3: Commit all 5 deploy scripts**

```bash
chmod +x deploy/scripts/*.sh
git add deploy/scripts/10-build-and-push.sh deploy/scripts/20-deploy-*.sh
git commit -m "feat(deploy): build + push + per-service deploy scripts"
```

---

### Task 7.10: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/deploy.yaml`

- [ ] **Step 1: Workflow**

```yaml
name: Deploy
on:
  push:
    tags:
      - 'v*.*.*-deploy'

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.GCP_WIF_PROVIDER }}
          service_account: ${{ secrets.GCP_DEPLOY_SA }}
      - uses: google-github-actions/setup-gcloud@v2
      - uses: pnpm/action-setup@v4
        with:
          version: 9.0.0
      - uses: actions/setup-node@v4
        with:
          node-version: 20.11.1
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r test
      - run: pnpm -r typecheck

      - name: Configure docker
        run: gcloud auth configure-docker ${{ vars.GCP_REGION }}-docker.pkg.dev --quiet

      - name: Build + push
        run: ./deploy/scripts/10-build-and-push.sh ${{ github.ref_name }}
        env:
          GCP_PROJECT_ID: ${{ vars.GCP_PROJECT_ID }}
          AR_REPO_LOCATION: ${{ vars.GCP_REGION }}
          AR_REPO_NAME: ${{ vars.AR_REPO_NAME }}

      - name: Deploy all services
        run: |
          for svc in web api crawler storyboard render; do
            ./deploy/scripts/20-deploy-$svc.sh ${{ github.ref_name }}
          done
        env:
          GCP_PROJECT_ID: ${{ vars.GCP_PROJECT_ID }}
          GCP_REGION: ${{ vars.GCP_REGION }}
          AR_REPO_LOCATION: ${{ vars.GCP_REGION }}
          AR_REPO_NAME: ${{ vars.AR_REPO_NAME }}
          GCS_BUCKET_NAME: ${{ vars.GCS_BUCKET_NAME }}
          REDIS_HOST: ${{ vars.REDIS_HOST }}
          REDIS_PORT: ${{ vars.REDIS_PORT }}
          API_PUBLIC_URL: ${{ vars.API_PUBLIC_URL }}

      - name: Smoke test
        run: ./deploy/scripts/30-smoke.sh
        env:
          API_PUBLIC_URL: ${{ vars.API_PUBLIC_URL }}
          WEB_PUBLIC_URL: ${{ vars.WEB_PUBLIC_URL }}
```

**Note on Workload Identity Federation**: Configuring WIF is a separate (well-documented) GitHub → GCP setup. Point the reader to https://github.com/google-github-actions/auth for the one-time setup. Add a section to `DEPLOYMENT.md`.

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/deploy.yaml
git commit -m "feat(deploy): GitHub Actions workflow for tag-triggered deploy"
```

---

### Task 7.11: Smoke test + DEPLOYMENT.md

**Files:**
- Create: `deploy/scripts/30-smoke.sh`
- Create: `deploy/scripts/99-teardown.sh`
- Expand: `deploy/DEPLOYMENT.md`

- [ ] **Step 1: `30-smoke.sh`**

```bash
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
```

- [ ] **Step 2: `99-teardown.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

: "${GCP_PROJECT_ID:?}"
: "${GCP_REGION:?}"
: "${GCS_BUCKET_NAME:?}"
: "${REDIS_INSTANCE_NAME:=lumespec-redis}"
: "${AR_REPO_NAME:=lumespec}"

read -p "Nuke all LumeSpec resources in project $GCP_PROJECT_ID? (type YES) " ack
[[ "$ack" == "YES" ]] || { echo "Aborted."; exit 1; }

for svc in web api crawler storyboard render; do
  gcloud run services delete "$svc" --region="$GCP_REGION" --quiet || true
done

gcloud redis instances delete "$REDIS_INSTANCE_NAME" --region="$GCP_REGION" --quiet || true
gcloud storage rm -r "gs://${GCS_BUCKET_NAME}" || true
gcloud artifacts repositories delete "$AR_REPO_NAME" --location="$GCP_REGION" --quiet || true

for sa in web api crawler storyboard render storage; do
  gcloud iam service-accounts delete "lumespec-${sa}@${GCP_PROJECT_ID}.iam.gserviceaccount.com" --quiet || true
done

for secret in anthropic-api-key gcs-hmac-access-id gcs-hmac-secret screenshotone-access-key; do
  gcloud secrets delete "$secret" --quiet || true
done

gcloud compute networks vpc-access connectors delete lumespec-connector --region="$GCP_REGION" --quiet || true

echo "Teardown complete."
```

- [ ] **Step 3: Expand `DEPLOYMENT.md`** with:
- Cost preview
- Workload Identity Federation one-time setup (point to Google's canonical docs)
- Troubleshooting: Redis connection, GCS IAM, Cloud Run quota, Chromium OOM
- Ops: how to tail logs (`gcloud logging read`), rollback (`gcloud run services update-traffic --to-revisions`)

- [ ] **Step 4: Commit**

```bash
git add deploy/scripts/30-smoke.sh deploy/scripts/99-teardown.sh deploy/DEPLOYMENT.md
git commit -m "feat(deploy): smoke test + teardown scripts + expanded runbook"
```

No push.

---

### Task 7.12: Execute first deploy + tag `v1.0.0-mvp`

This task is a **human-driven deploy**. Do NOT dispatch an automated subagent — the controller walks through the runbook with the user, confirming each billable step.

- [ ] **Step 1: Walk through `DEPLOYMENT.md` interactively**
- [ ] **Step 2: Verify smoke passes**
- [ ] **Step 3: Check Cloud Logging for any service errors in the first hour**
- [ ] **Step 4: Tag + push**

```bash
git tag -a v1.0.0-mvp -m "v1.0.0-mvp: first production deploy

All 5 services running on Cloud Run in \${GCP_REGION}:
- web:  \${WEB_PUBLIC_URL}
- api:  \${API_PUBLIC_URL}
- crawler / storyboard / render: private Cloud Run services
  reached via BullMQ on Memorystore Redis
- GCS (S3-interop) bucket: gs://\${GCS_BUCKET_NAME}

Smoke test: created a 10s demo for https://example.com and
reached 'done' state within 90 seconds."

git push origin main
git push origin v1.0.0-mvp
```

Also push a `v1.0.0-deploy` tag matching the CI trigger pattern, if a subsequent re-deploy is desired.

---

## Self-Review

**Spec coverage (§1):**
- Cloud Run deploy for 5 services ✓
- BullMQ on Memorystore Redis ✓ (7.4)
- GCS with S3-interop mode mapping to existing `@aws-sdk/client-s3` code ✓ (7.3 + service env vars)
- IAM role per service (7.5) + Secret Manager for API keys (7.5) ✓
- Pre-signed URLs in render for private buckets ✓ (7.7)
- Worker services with always-allocated CPU for BullMQ loops ✓ (7.8 service YAMLs)
- Tini PID 1 already in every worker's Dockerfile (Plans 1/2/5/6) ✓
- Crawler CLOUD_RUN.md sizing honored (2 vCPU / 2 GiB / gen2 / startup-cpu-boost) ✓
- Render 4 vCPU / 4 GiB based on 60s full-page screenshot + H.264 encode budget
- Rate limiting + backpressure already in API code; env vars passed through ✓

**Placeholders:** None inside task steps. `DEPLOYMENT.md`'s WIF setup points to Google's canonical doc rather than reinventing it — that's appropriate.

**Type consistency:** `presignedRewrite.ts`'s `SignedStoryboard` type widens the S3Uri brand to plain `string`. The cast in `index.ts` (`as any`) is local and annotated. Plan 3's `makeS3Resolver` no-ops on already-http inputs, so passing signed URLs works without modifying the Remotion composition.

**Scope check:** 12 tasks covering infra + code changes + CI + smoke. No feature work.

---

## Execution Handoff

Tasks 7.1–7.5 (infra provisioning): **run manually with user confirmation** — billable.
Tasks 7.6–7.11 (code + scripts): subagent-driven compressed mode OK.
Task 7.12 (first deploy): **human-driven** with runbook. Do not automate.
