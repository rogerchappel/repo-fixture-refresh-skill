# Repo Fixture Refresh Skill

Plans stale fixture refreshes from latest local command logs without unsafe rewrites.

Maintainer builds use the Node type environment declared in `tsconfig.json` and
the current TypeScript and `@types/node` majors. Run the checks with the Node
version used by the repository workflow when updating this toolchain.

## Quickstart

```bash
npm install
npm run build
npm exec -- repo-fixture-refresh plan --repo fixtures/sample-repo --log fixtures/latest-smoke.log --out .tmp/fixture-refresh.md --json .tmp/fixture-refresh.json
npm exec -- repo-fixture-refresh apply .tmp/fixture-refresh.json --approve safe-only --repo fixtures/sample-repo --dry-run
```

`plan` requires `--log`; `--repo` defaults to the current directory, and
`--out` and `--json` select optional output files. `apply` accepts one plan JSON
path, optional `--repo`, `--dry-run`, and `--approve safe-only|all` (default:
`safe-only`). Unknown, repeated, or incomplete options are rejected.

When both plan outputs are requested, `--out` and `--json` must resolve to
different files. The CLI stages both outputs before replacing either final file;
if either destination cannot be written, neither output is created or overwritten.

Apply rechecks every approved target against the state captured by `plan`. If a
target was modified, deleted, or created since planning, the command reports all
conflicts, exits unsuccessfully, and writes nothing. This check also runs during
`--dry-run`, so regenerate the plan and review it again before retrying.

### Saved plan format

Saved plans must be JSON objects with string `repo` and `log` fields, a
`checklist` array of strings, and a `changes` array. Every change is an object
with string `file`, `reason`, and `status` fields. `status` must be `unchanged`,
`safe-update`, or `needs-review`; optional `before` and `after` fields must be
strings when present. Additional fields are ignored for forward compatibility.

Both the library `applyPlan` function and the CLI validate this contract before
checking or writing any target. Invalid plans fail with a field-specific message
such as `plan.changes[0].status must be unchanged, safe-update, or needs-review`;
the CLI exits with status 1 and no fixture is written. A `--repo` override does
not bypass validation of the saved plan.

### Snapshot log format

A log may contain ordinary output around one or more snapshot blocks. Marker
lines and paths are case-sensitive:

```text
SNAPSHOT fixtures/output.txt
captured output, preserved byte-for-byte
END SNAPSHOT
```

Each `SNAPSHOT <path>` must have one matching `END SNAPSHOT` line. Paths must be
non-empty, repository-relative file paths without `.` or `..` segments, and may
appear only once per log. Snapshot bodies may be empty and retain their original
LF or CRLF newlines. Blocks are returned in log order.

Planning rejects logs with no snapshots, stray or missing end markers, nested
starts, invalid paths, and duplicate paths. The error identifies the offending
line when applicable. The CLI exits with status 1 and creates neither `--out`
nor `--json` output when snapshot parsing fails.

## Library

Import from `repo-fixture-refresh-skill` to build local-first automation around the same deterministic planner.

Saved plan JSON must contain unique `changes[].file` targets. Every actionable
`safe-update` or `needs-review` change must also contain a string `after` value;
invalid plans are rejected before the repository is accessed or any fixture is
written.

## Installed package

The package is not published to the npm registry yet. From a source checkout,
build a tarball, install it in a clean consumer directory, and inspect the
supported commands through its executable:

```bash
npm ci
npm run build
npm pack --pack-destination /tmp
mkdir /tmp/repo-fixture-refresh-consumer
cd /tmp/repo-fixture-refresh-consumer
npm init --yes
npm install /tmp/repo-fixture-refresh-skill-0.1.0.tgz
npm exec -- repo-fixture-refresh --help
```

After the package is published, `npm install repo-fixture-refresh-skill` will
be the registry install command. Until then, that command is unavailable.

The package includes its MIT license and exposes repository, issue tracker, and homepage metadata through npm.

```js
import { planRefresh, renderMarkdown } from 'repo-fixture-refresh-skill';

const plan = planRefresh('fixtures/sample-repo', 'fixtures/latest-smoke.log');
console.log(renderMarkdown(plan));
```

The package root is the supported library import surface. It exposes the
planner, Markdown renderer, apply function, saved-plan validator, snapshot parser, conflict error,
and their TypeScript declarations; consumers should not import files from
`dist` directly.

## Safety Notes

- No live connector calls.
- No credential reads.
- No publishing, tagging, or release creation.
- Treat generated Markdown and JSON as review evidence, not execution approval.
- Saved plans use optimistic concurrency checks and never partially apply when
  an approved target is stale.

## Limitations

V1 uses conservative heuristics and fixture inputs. Provider-specific state should still be checked by a human before risky external actions.
