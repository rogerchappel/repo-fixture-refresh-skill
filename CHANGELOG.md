# Changelog

## Unreleased

- Prevent saved refresh plans from overwriting fixture changes made after
  planning, including newly created and deleted targets.
- Abort mixed applies before any write and report every stale target in dry-run
  and real apply modes.

## 0.1.0

- Initial public release candidate.
- Local-first CLI, library, fixtures, tests, and skill documentation.
