# Safety Model

The package is local-first. Planning commands can write report files only when the caller provides output paths. Any external write, provider retry, fixture rewrite, publication, or merge remains outside this tool and requires explicit approval.

Applying a saved plan uses optimistic concurrency. Before either a dry-run or
real apply, every approved target is compared with the state recorded during
planning, including whether the target existed. Modified, deleted, and newly
created targets are reported together as conflicts. Any conflict aborts the
whole apply before writes begin; regenerate and review the plan rather than
retrying stale input.
