#!/usr/bin/env bash
set -euo pipefail

project_root=$(pwd)
smoke_root=$(mktemp -d "${TMPDIR:-/tmp}/repo-fixture-refresh-package.XXXXXX")
trap 'rm -rf "$smoke_root"' EXIT

npm pack --pack-destination "$smoke_root" >/dev/null
package_tarball=$(find "$smoke_root" -maxdepth 1 -name '*.tgz' -print -quit)
mkdir "$smoke_root/consumer"
cd "$smoke_root/consumer"
npm init --yes >/dev/null
npm install "$package_tarball" >/dev/null

npm exec -- repo-fixture-refresh plan \
  --repo "$project_root/fixtures/sample-repo" \
  --log "$project_root/fixtures/latest-smoke.log" \
  --out .tmp/fixture-refresh.md \
  --json .tmp/fixture-refresh.json
npm exec -- repo-fixture-refresh apply .tmp/fixture-refresh.json \
  --approve safe-only \
  --repo "$project_root/fixtures/sample-repo" \
  --dry-run | grep -F 'would write: fixtures/output.txt'
