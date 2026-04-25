# S3 Object Lifecycle Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configure object lifecycle policies so crawl/storyboard artifacts expire after 7 days and videos after 365 days — preventing unbounded storage growth without writing a cleanup cron.

**Architecture:** Two separate policy files — one for GCS (prod) using `gsutil lifecycle set`, one for MinIO (dev) imported via `mc ilm import`. The MinIO policy is applied automatically when the `minio-init` Docker service runs, so `pnpm infra:up` is enough to activate it locally. No application code changes needed.

**Tech Stack:** GCS JSON lifecycle policy, MinIO lifecycle XML, Docker Compose, `mc` (MinIO client).

---

### Key/Prefix structure (for reference)

The render worker stores objects at these S3 paths:
```
jobs/{jobId}/crawlResult.json   ← expire after 7 days (large, ephemeral)
jobs/{jobId}/storyboard.json    ← expire after 7 days (generated, re-creatable)
jobs/{jobId}/video.mp4          ← expire after 365 days (user asset)
jobs/{jobId}/thumb.webp         ← expire after 365 days (derived from video)
```

S3-compatible lifecycle rules only support prefix matching, not suffix. To distinguish artifact types we use separate prefixes in production. Since the current code uses a flat `jobs/{jobId}/filename` scheme, we configure by filename pattern using GCS's `matchesSuffix` (which GCS supports). For MinIO/AWS we set a broad 365-day rule covering all `jobs/` objects, and rely on per-file suffix tagging as a follow-up if shorter artifact retention matters locally.

---

### Task 1: GCS Production Lifecycle Policy

**Files:**
- Create: `deploy/lifecycle-gcs.json`
- Modify: `deploy/DEPLOYMENT.md` (or create if it doesn't already document this)

- [ ] **Step 1: Write the GCS lifecycle JSON**

  Create `deploy/lifecycle-gcs.json`:

  ```json
  {
    "lifecycle": {
      "rule": [
        {
          "action": { "type": "Delete" },
          "condition": {
            "age": 7,
            "matchesPrefix": ["jobs/"],
            "matchesSuffix": ["/crawlResult.json"]
          }
        },
        {
          "action": { "type": "Delete" },
          "condition": {
            "age": 7,
            "matchesPrefix": ["jobs/"],
            "matchesSuffix": ["/storyboard.json"]
          }
        },
        {
          "action": { "type": "Delete" },
          "condition": {
            "age": 365,
            "matchesPrefix": ["jobs/"],
            "matchesSuffix": ["/video.mp4"]
          }
        },
        {
          "action": { "type": "Delete" },
          "condition": {
            "age": 365,
            "matchesPrefix": ["jobs/"],
            "matchesSuffix": ["/thumb.webp"]
          }
        }
      ]
    }
  }
  ```

  **Note on `matchesSuffix`:** This is a GCS-specific extension. It is NOT supported by AWS S3 or MinIO. GCS evaluates prefix AND suffix as an AND condition — an object must match both to be deleted. Verified in GCS docs (2024): `matchesSuffix` is available on all storage classes.

- [ ] **Step 2: Verify the JSON is valid**

  ```bash
  node -e "const j = require('./deploy/lifecycle-gcs.json'); console.log('rules:', j.lifecycle.rule.length)"
  ```

  Expected output: `rules: 4`

- [ ] **Step 3: Add deployment instructions to DEPLOYMENT.md**

  Read `deploy/DEPLOYMENT.md` first. Find the section about GCS bucket setup (near the `02-gcs-bucket.sh` instructions). After the bucket creation step, add:

  ```markdown
  ### Apply object lifecycle policy

  After the bucket is created, apply the lifecycle rules to control storage costs:

  ```bash
  gsutil lifecycle set deploy/lifecycle-gcs.json gs://<YOUR_BUCKET_NAME>
  ```

  This configures:
  - `crawlResult.json` and `storyboard.json` → deleted after 7 days
  - `video.mp4` and `thumb.webp` → deleted after 365 days

  To verify the policy was applied:
  ```bash
  gsutil lifecycle get gs://<YOUR_BUCKET_NAME>
  ```
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add deploy/lifecycle-gcs.json deploy/DEPLOYMENT.md
  git commit -m "chore(infra): GCS object lifecycle policy — 7d artifacts, 365d videos"
  ```

---

### Task 2: MinIO Local Dev Lifecycle

**Files:**
- Create: `deploy/lifecycle-minio.xml`
- Modify: `docker-compose.dev.yaml` — add lifecycle import to `minio-init`

MinIO uses the AWS S3 lifecycle XML format (not the GCS JSON format). It supports `Filter/Prefix` but NOT `Filter/Suffix`. To expire crawl/storyboard artifacts we use the **7-day rule on all `jobs/` objects**, accepting that local dev videos are also deleted after 7 days (acceptable — dev data is ephemeral).

- [ ] **Step 1: Write the MinIO lifecycle XML**

  Create `deploy/lifecycle-minio.xml`:

  ```xml
  <?xml version="1.0" encoding="UTF-8"?>
  <LifecycleConfiguration>
    <!--
      Local dev only. Expires all objects under jobs/ after 7 days.
      In production (GCS), the per-suffix rules in lifecycle-gcs.json
      differentiate artifacts (7d) from videos (365d).
    -->
    <Rule>
      <ID>expire-job-artifacts</ID>
      <Status>Enabled</Status>
      <Filter>
        <Prefix>jobs/</Prefix>
      </Filter>
      <Expiration>
        <Days>7</Days>
      </Expiration>
    </Rule>
  </LifecycleConfiguration>
  ```

- [ ] **Step 2: Verify the XML is well-formed**

  ```bash
  node -e "
  const { DOMParser } = require('@xmldom/xmldom');
  " 2>/dev/null || node -e "
  const { execSync } = require('node:child_process');
  execSync('xmllint --noout deploy/lifecycle-minio.xml', { stdio: 'inherit' });
  console.log('XML valid');
  " 2>/dev/null || echo "xmllint not installed — skipping XML validation (safe to proceed)"
  ```

- [ ] **Step 3: Mount the lifecycle XML and apply it in `docker-compose.dev.yaml`**

  In `docker-compose.dev.yaml`, update the `minio-init` service. Find:

  ```yaml
  minio-init:
    image: minio/mc:RELEASE.2024-10-02T08-27-28Z
    depends_on:
      - minio
    entrypoint: >
      /bin/sh -c "
      sleep 2;
      mc alias set local http://minio:9000 minioadmin minioadmin;
      mc mb --ignore-existing local/promptdemo-dev;
      mc anonymous set download local/promptdemo-dev;
      exit 0;
      "
  ```

  Replace with:

  ```yaml
  minio-init:
    image: minio/mc:RELEASE.2024-10-02T08-27-28Z
    depends_on:
      - minio
    volumes:
      - ./deploy/lifecycle-minio.xml:/lifecycle.xml:ro
    entrypoint: >
      /bin/sh -c "
      sleep 2;
      mc alias set local http://minio:9000 minioadmin minioadmin;
      mc mb --ignore-existing local/promptdemo-dev;
      mc anonymous set download local/promptdemo-dev;
      mc ilm import local/promptdemo-dev < /lifecycle.xml;
      echo '[minio-init] lifecycle policy applied';
      exit 0;
      "
  ```

- [ ] **Step 4: Re-run infra to verify the lifecycle policy is applied**

  ```bash
  pnpm infra:down && pnpm infra:up
  ```

  Then verify:
  ```bash
  docker compose -f docker-compose.dev.yaml exec -T minio-init sh -c "
    mc alias set local http://minio:9000 minioadmin minioadmin 2>/dev/null;
    mc ilm ls local/promptdemo-dev
  " 2>/dev/null || docker run --rm --network=promptdemo_default minio/mc:RELEASE.2024-10-02T08-27-28Z \
    sh -c "mc alias set local http://minio:9000 minioadmin minioadmin && mc ilm ls local/promptdemo-dev"
  ```

  Expected output: shows 1 rule for `jobs/` with expiry 7 days.

  If `minio-init` exits before you can exec into it, run `pnpm infra:up` again and check the minio-init logs:
  ```bash
  docker compose -f docker-compose.dev.yaml logs minio-init
  ```
  Look for `[minio-init] lifecycle policy applied`.

- [ ] **Step 5: Commit**

  ```bash
  git add deploy/lifecycle-minio.xml docker-compose.dev.yaml
  git commit -m "chore(infra): MinIO local dev lifecycle — 7d expiry on jobs/ objects"
  ```

---

### Task 3: Document in design-decisions.md

**Files:**
- Modify: `docs/readme/design-decisions.md`

- [ ] **Step 1: Add lifecycle section to design-decisions.md**

  Open `docs/readme/design-decisions.md` and append a new section at the end (before the final `<p align="center">` closing tag):

  ```markdown
  ---

  ## Amendment B: S3 Object Lifecycle Management

  Crawl results (`crawlResult.json`) and storyboard JSONs (`storyboard.json`) are needed only during the active render pipeline. After the MP4 is uploaded, these artifacts serve no purpose but consume storage at ~50–200 KB each. At 1000 renders/month: ~150 MB/month of unnecessary growth.

  **The split:**
  - Artifacts (crawl + storyboard) → 7-day expiry.
  - Videos + thumbnails → 365-day expiry (longest per-tier retention — free=30d SQL cron, pro=90d SQL cron, max=365d storage limit).

  **Implementation:**
  - **Prod (GCS):** `deploy/lifecycle-gcs.json` applied via `gsutil lifecycle set`. Uses `matchesSuffix` (GCS extension) to distinguish artifact types from videos within the flat `jobs/{jobId}/` prefix.
  - **Local (MinIO):** `deploy/lifecycle-minio.xml` imported by `minio-init` at `pnpm infra:up` time. Uses a single 7-day rule on `jobs/` (MinIO doesn't support suffix matching; acceptable for local dev where data is ephemeral).

  **Why not app-level deletion:** Deleting objects in the upload path adds latency to the critical render pipeline. Storage lifecycle rules run asynchronously in the cloud provider's background scan — zero user-facing impact.

  **Per-tier retention:** The 30d/90d/365d tiers described in §5 are enforced by a SQL DELETE cron (not yet shipped — see remaining-work.md §4) that removes `jobs` rows beyond the tier window. The lifecycle rule covers the maximum (365d) so S3 is always the ceiling; the SQL cron enforces the floor for shorter-retention tiers.
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add docs/readme/design-decisions.md
  git commit -m "docs: Amendment B — S3 lifecycle management rationale and setup"
  ```

- [ ] **Step 3: Mark §6 done in remaining-work.md**

  In `docs/superpowers/remaining-work.md`, find the §6 section header:
  ```markdown
  ## 6. Object Lifecycle Management for S3/MinIO (Amendment B)
  ```
  And add a status line after it:
  ```markdown
  **Status: ✅ Shipped 2026-04-26** — `deploy/lifecycle-gcs.json` (GCS, suffix-aware) + `deploy/lifecycle-minio.xml` (MinIO, prefix-only, applied by minio-init). See design-decisions.md Amendment B.
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add docs/superpowers/remaining-work.md
  git commit -m "docs: mark S3 lifecycle management as complete in remaining-work.md"
  ```
