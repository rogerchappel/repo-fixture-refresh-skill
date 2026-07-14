# Examples

```bash
repo-fixture-refresh plan --repo fixtures/sample-repo --log fixtures/latest-smoke.log --out .tmp/fixture-refresh.md --json .tmp/fixture-refresh.json
repo-fixture-refresh apply .tmp/fixture-refresh.json --approve safe-only --repo fixtures/sample-repo --dry-run
```

Reports are designed for release-candidate PR bodies and agent handoffs.
