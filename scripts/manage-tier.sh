#!/usr/bin/env bash
# Upgrade or downgrade a user's subscription tier in the local dev DB.
#
# Usage:
#   ./scripts/manage-tier.sh upgrade   chadcoco1444@gmail.com pro
#   ./scripts/manage-tier.sh downgrade chadcoco1444@gmail.com free
#
# Tiers:  free (30s) | pro (300s) | max (2000s)
# Requires: Docker running with the postgres container

set -euo pipefail

ACTION=${1:-}
EMAIL=${2:-}
TIER=${3:-}

# ── Validation ────────────────────────────────────────────────────────────────

if [[ -z "$ACTION" || -z "$EMAIL" || -z "$TIER" ]]; then
  echo "Usage: $0 <upgrade|downgrade> <email> <free|pro|max>"
  exit 1
fi

if [[ "$ACTION" != "upgrade" && "$ACTION" != "downgrade" ]]; then
  echo "Error: action must be 'upgrade' or 'downgrade'"
  exit 1
fi

if [[ "$TIER" != "free" && "$TIER" != "pro" && "$TIER" != "max" ]]; then
  echo "Error: tier must be free, pro, or max"
  exit 1
fi

# ── Credit allowances (mirrors apps/api/src/credits/ledger.ts) ────────────────

case "$TIER" in
  free) ALLOWANCE=30   ;;
  pro)  ALLOWANCE=300  ;;
  max)  ALLOWANCE=2000 ;;
esac

# ── Locate postgres container ─────────────────────────────────────────────────

PG_CONTAINER=$(docker ps --format '{{.Names}}' | grep -i postgres | head -1 || true)
if [[ -z "$PG_CONTAINER" ]]; then
  echo "Error: no running postgres container found. Is Docker running?"
  exit 1
fi

PSQL="docker exec -i $PG_CONTAINER psql -U promptdemo -d promptdemo -t -A"

# ── Check user exists ─────────────────────────────────────────────────────────

USER_ID=$($PSQL -c "SELECT id FROM users WHERE email = '$EMAIL' LIMIT 1" | tr -d '[:space:]')
if [[ -z "$USER_ID" ]]; then
  echo "Error: no user found with email '$EMAIL'"
  exit 1
fi

# ── Show current state ────────────────────────────────────────────────────────

echo ""
echo "Before:"
docker exec -i "$PG_CONTAINER" psql -U promptdemo -d promptdemo -c \
  "SELECT u.email,
          COALESCE(s.tier, 'free') AS tier,
          COALESCE(c.balance, 0)   AS credits
   FROM users u
   LEFT JOIN subscriptions s ON s.user_id = u.id
   LEFT JOIN credits      c ON c.user_id = u.id
   WHERE u.email = '$EMAIL';"

# ── Apply changes (single transaction) ───────────────────────────────────────

docker exec -i "$PG_CONTAINER" psql -U promptdemo -d promptdemo -c "
BEGIN;

-- Upsert subscription tier
INSERT INTO subscriptions (user_id, tier, status)
VALUES ($USER_ID, '$TIER', 'active')
ON CONFLICT (user_id)
DO UPDATE SET tier = '$TIER', status = 'active', updated_at = now();

-- Reset credits to the new tier's monthly allowance
INSERT INTO credits (user_id, balance)
VALUES ($USER_ID, $ALLOWANCE)
ON CONFLICT (user_id)
DO UPDATE SET balance = $ALLOWANCE, updated_at = now();

-- Audit log entry
INSERT INTO credit_transactions (user_id, job_id, delta, reason, balance_after)
VALUES ($USER_ID, NULL, $ALLOWANCE, 'grant', $ALLOWANCE);

COMMIT;
" > /dev/null

# ── Show new state ────────────────────────────────────────────────────────────

echo ""
echo "After ($ACTION → $TIER):"
docker exec -i "$PG_CONTAINER" psql -U promptdemo -d promptdemo -c \
  "SELECT u.email,
          COALESCE(s.tier, 'free') AS tier,
          COALESCE(c.balance, 0)   AS credits
   FROM users u
   LEFT JOIN subscriptions s ON s.user_id = u.id
   LEFT JOIN credits      c ON c.user_id = u.id
   WHERE u.email = '$EMAIL';"

echo "✓ $EMAIL is now on the $TIER plan with ${ALLOWANCE}s credits."
