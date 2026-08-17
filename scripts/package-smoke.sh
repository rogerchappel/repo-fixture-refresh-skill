#!/usr/bin/env bash
set -euo pipefail

project_root=$(pwd)
smoke_root=$(mktemp -d "${TMPDIR:-/tmp}/repo-fixture-refresh-package.XXXXXX")
trap 'rm -rf "$smoke_root"' EXIT

npm pack --pack-destination "$smoke_root" >/dev/null
package_tarball=$(find "$smoke_root" -maxdepth 1 -name '*.tgz' -print -quit)
tar -xOf "$package_tarball" package/LICENSE > "$smoke_root/packed-license"
cmp "$project_root/LICENSE" "$smoke_root/packed-license"
if tar -tzf "$package_tarball" | grep -q '^package/dist/test/'; then
  echo 'package contains compiled test artifacts under dist/test' >&2
  exit 1
fi
mkdir "$smoke_root/consumer"
cd "$smoke_root/consumer"
npm init --yes >/dev/null
npm install "$package_tarball" >/dev/null

help_output=$(npm exec -- repo-fixture-refresh --help)
case "$help_output" in
  "usage: repo-fixture-refresh "*) ;;
  *) echo 'installed CLI help did not print usage' >&2; exit 1 ;;
esac

if npm exec -- repo-fixture-refresh unknown >unknown.stdout 2>unknown.stderr; then
  echo 'unknown command unexpectedly succeeded' >&2
  exit 1
fi
grep -q '^unknown command: unknown$' unknown.stderr
grep -q '^usage: repo-fixture-refresh ' unknown.stderr

PROJECT_ROOT="$project_root" node --input-type=module <<'EOF'
import process from 'node:process';
import { planRefresh, renderMarkdown } from 'repo-fixture-refresh-skill';

const projectRoot = process.env.PROJECT_ROOT;
if (!projectRoot) throw new Error('PROJECT_ROOT is required');

const plan = planRefresh(
  `${projectRoot}/fixtures/sample-repo`,
  `${projectRoot}/fixtures/latest-smoke.log`,
);
const markdown = renderMarkdown(plan);

if (plan.changes.length === 0) throw new Error('expected a representative refresh plan');
if (!markdown.startsWith('# Repo Fixture Refresh Plan\n')) {
  throw new Error('expected rendered plan Markdown');
}
EOF

npm exec -- repo-fixture-refresh plan \
  --repo "$project_root/fixtures/sample-repo" \
  --log "$project_root/fixtures/latest-smoke.log" \
  --out .tmp/fixture-refresh.md \
  --json .tmp/fixture-refresh.json
npm exec -- repo-fixture-refresh apply .tmp/fixture-refresh.json \
  --approve safe-only \
  --repo "$project_root/fixtures/sample-repo" \
  --dry-run | grep -F 'would write: fixtures/output.txt'
