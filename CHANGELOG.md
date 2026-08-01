# Changelog

## Unreleased

- Reject malformed or ambiguous snapshot logs before creating plan output,
  while preserving newline fidelity for valid multi-snapshot logs.
- Expose the documented package-root library import with JavaScript and
  TypeScript entrypoints, verified from the packed consumer artifact.
- Prevent saved refresh plans from overwriting fixture changes made after
  planning, including newly created and deleted targets.
- Abort mixed applies before any write and report every stale target in dry-run
  and real apply modes.

## 0.1.0

- Initial public release candidate.
- Local-first CLI, library, fixtures, tests, and skill documentation.
