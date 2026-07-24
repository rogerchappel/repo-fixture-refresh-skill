# Repo Fixture Refresh Skill

Use this skill when an agent needs to detect stale fixtures after repository behavior changes and draft a safe refresh plan.

## Required Inputs

- Local repository or fixture path.
- Captured logs or JSON action records.
- Explicit approval before any external action or fixture rewrite.

## Side Effects

Default commands only read local files and write requested reports. Do not use this skill to publish, tag, merge, or call live connector APIs.

## Workflow

1. Run the planner against fixtures or logs.
2. Review JSON and Markdown output.
3. Run a dry-run apply. It rechecks that every target still matches the state
   captured by the plan.
4. If the command reports a conflict, regenerate and review the plan. Do not
   retry the stale plan: apply exits unsuccessfully and writes nothing whenever
   any approved target was modified, deleted, or created.
5. Paste evidence into the release-candidate PR.

## Examples

```bash
repo-fixture-refresh plan --repo fixtures/sample-repo --log fixtures/latest-smoke.log --out .tmp/fixture-refresh.md --json .tmp/fixture-refresh.json
repo-fixture-refresh apply .tmp/fixture-refresh.json --approve safe-only --repo fixtures/sample-repo --dry-run
```
