# Examples

```bash
repo-fixture-refresh plan --repo fixtures/sample-repo --log fixtures/latest-smoke.log --out .tmp/fixture-refresh.md --json .tmp/fixture-refresh.json
repo-fixture-refresh apply .tmp/fixture-refresh.json --approve safe-only --repo fixtures/sample-repo --dry-run
```

If a fixture changes between these commands, apply reports the stale target:

```text
fixture refresh conflicts:
- fixtures/output.txt: target was modified after this plan was generated
```

The command exits unsuccessfully without writing any target, including targets
that had no conflict. Regenerate both reports, review the new before/after state,
and rerun the dry-run before applying.

Reports are designed for release-candidate PR bodies and agent handoffs.
