# Repo Fixture Refresh Skill

Plans stale fixture refreshes from latest local command logs without unsafe rewrites.

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

## Installed package

Install the package and inspect the supported commands through its executable:

```bash
npm install repo-fixture-refresh-skill
npx repo-fixture-refresh --help
```

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
