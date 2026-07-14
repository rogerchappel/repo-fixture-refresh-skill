#!/usr/bin/env bash
set -euo pipefail
rm -rf .tmp
mkdir -p .tmp
node dist/cli.js plan --repo fixtures/sample-repo --log fixtures/latest-smoke.log --out .tmp/fixture-refresh.md --json .tmp/fixture-refresh.json
node dist/cli.js apply .tmp/fixture-refresh.json --approve safe-only --repo fixtures/sample-repo --dry-run
