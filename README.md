# approvepath

A CODEOWNERS file says who is *supposed* to approve a change.
Review history says who *actually* shows up. approvepath puts
the two side by side for one pull request: you hand it the
CODEOWNERS rules, the files the PR touches, and whatever past
review activity you have, and it hands back, per file, the
owners the rules assign and the people who have reviewed that
exact file before.

Pattern matching follows a pinned subset of CODEOWNERS
semantics, so the answer never depends on which CODEOWNERS
dialect you had in mind. Any leading `/` is stripped from both
the pattern and the file path before comparing. A pattern
ending in `/` is a directory prefix: it matches every file
under that directory. A pattern containing `*` is a glob that
must match the whole path — `**` matches any run of characters
including `/`, while a single `*` matches any run except `/`.
Any other pattern matches a file that equals it exactly, or a
file underneath it (the pattern plus `/` as a prefix), so a
bare directory name owns its whole subtree.

When several rules match the same file, the **last** matching
rule in file order wins — the same override rule CODEOWNERS
itself uses, and the reason a broad early rule can hand a
subtree to a team while a later, narrower rule hands one
corner of it back. A file no rule matches is unowned: its
owners list is empty and its pattern is `null`, and it also
appears in `unowned_files`, in input order.

Review history is counted plainly. For each changed file,
`frequent_reviewers` counts, per reviewer, how many supplied
review entries by that reviewer list the file exactly — no
prefix credit, no directory credit. Reviewers are ranked by
count descending, then by name ascending, and only the top
three are reported. `required_reviewers` collects every owner
from every winning rule across the PR, deduplicated and
sorted, which is the shortest honest answer to "whose
approval does this PR actually need?".

Everything is computed locally from the arguments alone: no
repository is read, no hosting API is called, and nothing is
guessed. Malformed input — a rule with an empty pattern, a
changed file that is not a non-empty string, a review entry
missing its reviewer — is a validation error naming the
offending path, with no partial result.

## CLI

```bash
npx @reneturcios/approvepath map --input args.json
npx @reneturcios/approvepath --version
```

`args.json` contains the full arguments object:

```json
{
  "codeowners": [
    { "pattern": "src/", "owners": ["@core"] },
    { "pattern": "src/api/", "owners": ["@api-team", "sam"] }
  ],
  "changed_files": ["src/api/handler.ts", "README.md"],
  "reviews": [
    { "reviewer": "sam", "files": ["src/api/handler.ts"] },
    { "reviewer": "lee", "files": ["src/api/handler.ts"] }
  ]
}
```

`reviews` is optional and defaults to `[]`. The result is
printed as JSON:

```json
{
  "files": [
    {
      "file": "src/api/handler.ts",
      "owners": ["@api-team", "sam"],
      "pattern": "src/api/",
      "frequent_reviewers": [
        { "reviewer": "lee", "reviews": 1 },
        { "reviewer": "sam", "reviews": 1 }
      ]
    },
    {
      "file": "README.md",
      "owners": [],
      "pattern": null,
      "frequent_reviewers": []
    }
  ],
  "unowned_files": ["README.md"],
  "required_reviewers": ["@api-team", "sam"]
}
```

Exit codes: `0` on success, `1` on a runtime error (including
an unreadable or invalid input file, or invalid input), `2`
on a usage error.

## MCP server

```bash
npx -y @reneturcios/approvepath mcp
```

MCP client config:

```json
{
  "mcpServers": {
    "approvepath": {
      "command": "npx",
      "args": ["-y", "@reneturcios/approvepath", "mcp"]
    }
  }
}
```

### Tools

- `map_approvals` — Map the approval path for a pull request.
  - `codeowners` (array, required, may be empty) — CODEOWNERS
    rules in file order; each entry is `{pattern, owners}`,
    where `pattern` is a non-empty string and `owners` is an
    array of non-empty strings (may be empty)
  - `changed_files` (array of strings, required, non-empty) —
    paths of the files the PR changes
  - `reviews` (array, optional, default `[]`) — past review
    activity; each entry is `{reviewer, files}`, where
    `reviewer` is a non-empty string and `files` is an array
    of strings (may be empty)

  Returns `{files, unowned_files, required_reviewers}`, where
  `files` holds one `{file, owners, pattern,
  frequent_reviewers}` entry per changed file, in input order.

## Docker

```bash
docker run -i ghcr.io/cloudcorprecords/approvepath
docker run --rm -v "$PWD:/w" ghcr.io/cloudcorprecords/approvepath map --input /w/args.json
```

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # tsx --test test/*.test.ts (pure local, no network)
npm run dev     # run the CLI from source
```

## License

MIT — Copyright (c) 2026 Rene Turcios
