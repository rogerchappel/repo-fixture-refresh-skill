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

## Library

Import from `repo-fixture-refresh-skill` to build local-first automation around the same deterministic planner.

```js
import { planRefresh, renderMarkdown } from 'repo-fixture-refresh-skill';

const plan = planRefresh('fixtures/sample-repo', 'fixtures/latest-smoke.log');
console.log(renderMarkdown(plan));
```

The package root is the supported library import surface. It exposes the
planner, Markdown renderer, apply function, snapshot parser, conflict error,
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
