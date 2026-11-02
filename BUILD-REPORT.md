# approvepath — Build Report

MCP Rebuild 1000, Batch 17. Original program build from the
packages-100 plan (cluster A #9), built from the spec in
`~/workspace/mcp-rebuild-100/specs-batch17/approvepath.md`
(read first). There is no external original; the tool surface
is the program's defined spec. Local build only — nothing
pushed or published.

Identity: repo `approvepath`, npm `@reneturcios/approvepath`,
MCP name `io.github.CloudCorpRecords/approvepath`, version
`0.1.0`, bin `approvepath` → `dist/cli.js`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json`, `server.json` (description "Map who must
  approve a PR: CODEOWNERS rules plus who actually reviews
  these files." — 82 chars, verified by count; npm entry
  carries `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/approvepath:0.1.0` carries **no**
  `version` field), `Dockerfile` (node:20-alpine two-stage,
  label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/approvepath"`),
  `tsconfig.json`, `.gitignore`, `LICENSE` (MIT, Copyright
  (c) 2026 Rene Turcios), `README.md` (fresh text),
  `CHANGELOG.md` (single 0.1.0 entry, 2026-10-27),
  `package-lock.json` (Route 3, see below)
- `src/index.ts`, `src/cli.ts` (`map --input <args.json>`
  where the file holds the full arguments object, `mcp`,
  `--version`; exit 2 usage / 1 runtime error, argument
  validation before any file read), `src/mcp.ts`,
  `src/types.ts`, `src/approvepath.ts` (core,
  `VERSION = "0.1.0"`, also exporting the pinned
  `patternMatches`)
- `test/approvepath.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (publish-container `IMAGE = ghcr.io/cloudcorprecords/approvepath`,
  smoke-test server-name assertion `approvepath`)

Plus the parity fixture at
`harness/fixtures/approvepath-tools-original.json`, labelled
as a program spec from the packages-100 plan cluster A #9.

## Tools implemented (1)

- `map_approvals` — arguments: `codeowners` (array,
  required, may be empty; each entry an object with
  `pattern`, a non-empty string, and `owners`, an array of
  non-empty strings that may be empty), `changed_files`
  (array of non-empty strings, required, non-empty), and
  `reviews` (array, optional, default []; each entry an
  object with `reviewer`, a non-empty string, and `files`,
  an array of strings that may be empty). The schema
  literal carries the nested entry schemas for both
  `codeowners` and `reviews` entries exactly.

  Pattern matching is a pinned subset of CODEOWNERS
  semantics. Paths are compared with any leading "/"
  stripped from both pattern and file. A pattern ending
  in "/" matches when the file path starts with the
  pattern (directory prefix). A pattern containing "*"
  matches by glob: "**" matches any run of characters
  including "/", "*" matches any run except "/", and the
  whole file path must match the whole pattern. Any other
  pattern matches when the file equals the pattern or
  starts with the pattern + "/". The LAST matching rule
  wins for a file; a file with no matching rule is
  unowned (owners [], pattern null).

  Review history is pinned: for each changed file,
  `frequent_reviewers` counts, per reviewer, the number
  of `reviews` entries by that reviewer whose `files`
  contain the file exactly, sorted by count descending
  then reviewer ascending, top 3 reported as {reviewer,
  reviews}. `required_reviewers` is the distinct union of
  all winning owners across the changed files, sorted
  ascending. `unowned_files` lists the changed files with
  no matching rule, in input order. Returns {files,
  unowned_files, required_reviewers}, where `files` holds
  one {file, owners, pattern, frequent_reviewers} entry
  per changed file, in input order, with `owners` in the
  winning rule's order.

  The fixture literal
  (`harness/fixtures/approvepath-tools-original.json`) and
  the `src/mcp.ts` literal are identical, with no `$schema`
  and no `additionalProperties` — confirmed by the parity
  run below.

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server` with an
  explicit inputSchema literal exactly matching the
  fixture, per the standing fleet rule (no McpServer/zod
  schema conversion). Every `tools/call` is validated by
  the core itself, so the MCP and CLI paths share one
  validation implementation; the core takes the full
  arguments object (`{codeowners, changed_files,
  reviews?}`).
- Validation is path-naming and total: a missing or
  non-array `codeowners`; an entry that is not an object
  or has a missing, empty, or non-string `pattern` or a
  missing, non-array, or badly-typed `owners`; a missing,
  non-array, empty, or badly-typed `changed_files`; or a
  present-but-malformed `reviews` throws an Error naming
  the offending path (for example
  `codeowners[0].owners[1] must be a non-empty string`,
  `reviews[0].files must be an array`) and produces no
  partial result (MCP: `isError`; CLI: exit 1).

## Verification (foreground, this session)

- `npm test` (`tsx --test test/*.test.ts`): **56 tests,
  56 pass, 0 fail** — every matcher class (trailing-"/"
  directory prefix including the directory-name-as-file
  non-match, `*` glob including empty runs, no crossing
  of "/", whole-path anchoring, and literal regex
  metacharacters, `**` glob including empty runs and
  `*`/`**` combinations, plain exact match and plain
  pattern + "/" prefix including the mere-string-prefix
  non-match); leading-"/" stripping on the pattern, on
  the file, and on both; last-match-wins in both
  directions (later specific over earlier broad, later
  broad over earlier specific), the last of three matching
  rules, winning owners in rule order, and a winning rule
  with empty owners; unowned files (owners [] / pattern
  null, input order preserved), empty codeowners, and
  empty/omitted reviews; reviewer counting (per-entry
  counts, per-file counts, exact-match-only, one entry
  listing a file twice counting once, ties broken by
  reviewer ascending, the top-3 cutoff, entries with
  empty files); the sorted distinct owner union (losing
  rules excluded, duplicates collapsed) and a full-result
  deep-equal against the pinned output shape; and every
  validation path (missing/non-array `codeowners`,
  non-object entries, pattern/owners/reviewer/files
  missing, empty, and badly-typed at each indexed path,
  missing/non-array/empty `changed_files` and its bad
  entries, present-but-non-array `reviews`, unknown extra
  fields ignored at every level, non-object top-level
  treated as {}, and no partial result on invalid input).
- `npx tsc --noEmit` → exit 0; `npm run build` produced
  `dist/` with all 15 outputs.
- `dist/cli.js --version` → `0.1.0`; unknown command exits
  2 with usage; `map` with no `--input` exits 2; `map`
  with an unknown flag exits 2; `map --input <missing
  file>` exits 1 naming the file; `map --input <valid
  file>` exits 0 and prints the hand-checked result for
  the README example input (handler owned by
  ["@api-team", "sam"] via `src/api/`, README.md unowned,
  frequent reviewers lee/sam tied at 1,
  `required_reviewers` ["@api-team", "sam"]); `map
  --input <invalid file>` (empty reviewer) exits 1 with
  `reviews[0].reviewer must be a non-empty string`.
- Parity: `harness/parity.py` vs
  `harness/fixtures/approvepath-tools-original.json` →
  **PASS, parity 100.0, identical_tools 1/1** (run with
  the rebuild path as an absolute path; the harness does
  not expand a `~` inside the quoted stdio command
  string). Report saved under `parity-out/`.

## Lockfile status

`package-lock.json` generated clean via Route 3 (in the
build directory with no `node_modules` present, offline
`npm install --package-lock-only --ignore-scripts
--offline`), verified: parses, name
`@reneturcios/approvepath`, **128 package entries**.
Resolved versions match the sibling reference tree
(`@modelcontextprotocol/sdk` 1.32.2, `zod` 3.25.76,
`tsx` 4.23.15, `typescript` 5.9.3, `@types/node`
20.19.43). The subsequent offline
`npm install --ignore-scripts --offline`, build, tests,
and parity all ran against this lockfile's tree.

## Gaps / honest notes

- **Pinned judgement calls** (each with a dedicated
  test where applicable): (1) the winning rule's
  `pattern` is reported exactly as supplied, including
  any leading "/" that matching stripped (the spec pins
  stripping for comparison but does not say to rewrite
  the reported pattern); (2) one review entry listing
  the same file twice counts once for that reviewer —
  the spec counts entries whose `files` contain the
  file, and "contain" is a per-entry property; (3)
  unknown extra fields are ignored rather than rejected
  at every level (the spec does not forbid them); (4) a
  non-object top-level arguments value is treated as an
  empty object, so it fails as `codeowners is
  required`; (5) `reviews[].files` entries are validated
  as strings but may be empty (the spec requires
  non-empty entries only for `codeowners[].owners` and
  `changed_files`; an empty string can never equal a
  changed file, which is itself non-empty); (6)
  error-message wording follows the fleet's path-naming
  pattern (for example `changed_files must be a
  non-empty array`). No other spec ambiguity was found
  in the core behaviour.
- Container build not exercised locally; the
  publish-container workflow smoke-tests the image at
  publish time.
- Nothing pushed or published; this is a local build only.
