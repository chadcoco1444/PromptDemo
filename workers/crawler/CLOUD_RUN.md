# Crawler Worker — Cloud Run Sizing

The BullMQ worker uses `concurrency: 2`, so each container runs up to two
Playwright + Chromium contexts simultaneously. Under-provisioning causes
context timeouts under real traffic, not load-test traffic.

## Minimum recommended config

| Setting                       | Value   | Reason                                               |
|------------------------------|---------|------------------------------------------------------|
| CPU                          | 2 vCPU  | 1 vCPU per concurrent Playwright context             |
| Memory                       | 2 GiB   | Each Chromium + full-page screenshot ≈ 400–700 MiB   |
| CPU boost on startup         | enabled | Playwright launch is CPU-bound for ~2s               |
| Min instances                | 0 or 1  | 1 avoids cold-start latency on demo traffic          |
| Max instances                | 10      | See §3 Global Backpressure — queue cap supersedes    |
| Request timeout              | 600s    | Matches `lockDuration` in BullMQ worker options      |
| HTTP concurrency (if any)    | 1       | We do not expose HTTP; this is for health probes     |
| Execution environment        | gen2    | Required for `--disable-dev-shm-usage` to work well  |

## Failure modes and symptoms

- **OOMKilled on fullPage screenshots** → bump memory to 4 GiB.
- **"Protocol error: Target closed"** → CPU starvation from concurrency=2
  on 1 vCPU. Bump CPU, not concurrency.
- **Zombie chromium processes** → `tini` entrypoint missing or image base
  not set correctly.
- **Redis connection reset every 90s** → `lockDuration` too aggressive for
  p99 crawl time; bump to 120_000 and revisit Playwright timeout.
