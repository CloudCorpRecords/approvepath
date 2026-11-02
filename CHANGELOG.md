# Changelog

## 0.1.0 (2026-10-27)

- Initial release: `map_approvals` MCP tool and `map` CLI
  command mapping the approval path for a pull request
  from supplied CODEOWNERS rules, changed files, and
  review history.
- Pinned pattern matching, a deliberate subset of
  CODEOWNERS semantics: leading "/" stripped from both
  pattern and file, a trailing-"/" pattern is a directory
  prefix, a pattern containing "*" is a glob ("**"
  crosses "/", "*" does not), and any other pattern
  matches exactly or as a directory prefix. The last
  matching rule wins.
- Pinned review history: per changed file, reviewers are
  counted by the number of review entries whose files
  contain the file exactly, ranked by count descending
  then reviewer ascending, top 3 reported.
- `required_reviewers` is the distinct union of all
  winning owners, sorted ascending; `unowned_files` lists
  the changed files no rule matched, in input order.
- Path-naming validation errors for malformed input,
  with no partial results on invalid input.
