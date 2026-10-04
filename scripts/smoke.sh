#!/usr/bin/env bash
set -euo pipefail
tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/repo-fixture-refresh-smoke.XXXXXX")
cleanup() { rm -rf "$tmp_dir"; }
trap cleanup EXIT
markdown="$tmp_dir/fixture-refresh.md"
json="$tmp_dir/fixture-refresh.json"
node dist/cli.js plan --repo fixtures/sample-repo --log fixtures/latest-smoke.log --out "$markdown" --json "$json"
test -s "$markdown"
test -s "$json"
grep -q '^# Repo Fixture Refresh Plan' "$markdown"
node -e 'const p=JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")); if (!p || typeof p !== "object" || !Array.isArray(p.changes)) process.exit(1)' "$json"
node dist/cli.js apply "$json" --approve safe-only --repo fixtures/sample-repo --dry-run
