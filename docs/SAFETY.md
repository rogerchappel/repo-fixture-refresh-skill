# Safety Model

The package is local-first. Planning commands can write report files only when the caller provides output paths. Any external write, provider retry, fixture rewrite, publication, or merge remains outside this tool and requires explicit approval.
