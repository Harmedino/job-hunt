#!/usr/bin/env bash
set -euo pipefail
: "${CRON_SECRET:?Set CRON_SECRET}"
curl --fail-with-body --silent --show-error --header "Authorization: Bearer ${CRON_SECRET}" "${JOB_HUNT_URL:-http://localhost:3000}/api/cron"
