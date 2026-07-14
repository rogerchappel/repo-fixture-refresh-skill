# Orchestration

Use this package before an agent changes fixtures, retries connector work, or summarizes release evidence. Inputs stay local. Outputs are review artifacts that can be pasted into a PR or handoff.

## Boundaries

The CLI never contacts external services, reads credentials, publishes packages, or performs provider writes.
