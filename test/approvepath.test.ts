import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapApprovals, patternMatches } from "../src/approvepath.js";

/**
 * All tests are pure local computation over inline data:
 * no filesystem and no network. Each pinned matcher class
 * (directory prefix, * glob, ** glob, exact, plain-prefix),
 * leading-slash handling, last-match-wins (including a
 * later broad rule overriding an earlier specific one),
 * unowned files, reviewer counting with ties and the
 * top-3 cutoff, the sorted owner union, empty codeowners
 * and empty reviews, and every validation path are each
 * pinned.
 */

const one = (
  codeowners: unknown,
  changed_files: unknown,
  reviews?: unknown,
) =>
  mapApprovals({
    codeowners,
    changed_files,
    ...(reviews === undefined ? {} : { reviews }),
  });

describe("patternMatches — directory prefix patterns (trailing /)", () => {
  it("a trailing-/ pattern matches files under the directory", () => {
    assert.equal(patternMatches("src/", "src/index.ts"), true);
    assert.equal(patternMatches("src/", "src/deep/nested.ts"), true);
  });

  it("a trailing-/ pattern does not match outside the directory", () => {
    assert.equal(patternMatches("src/", "lib/index.ts"), false);
    assert.equal(patternMatches("src/", "srcx/index.ts"), false);
  });

  it("a trailing-/ pattern does not match the directory name as a file", () => {
    // After stripping, "src" does not start with "src/".
    assert.equal(patternMatches("src/", "src"), false);
  });
});

describe("patternMatches — * glob (does not cross /)", () => {
  it("* matches a run of characters within one path segment", () => {
    assert.equal(patternMatches("*.ts", "index.ts"), true);
    assert.equal(patternMatches("src/*.ts", "src/index.ts"), true);
    assert.equal(patternMatches("src/*-test.ts", "src/api-test.ts"), true);
  });

  it("* matches an empty run", () => {
    assert.equal(patternMatches("*.ts", ".ts"), true);
    assert.equal(patternMatches("a*c", "ac"), true);
  });

  it("* does not cross a /", () => {
    assert.equal(patternMatches("*.ts", "src/index.ts"), false);
    assert.equal(patternMatches("src/*.ts", "src/deep/index.ts"), false);
  });

  it("a glob must match the whole path", () => {
    assert.equal(patternMatches("*.ts", "index.tsx"), false);
    assert.equal(patternMatches("src/*.ts", "xsrc/index.ts"), false);
  });

  it("regex metacharacters in a glob pattern are literal", () => {
    assert.equal(patternMatches("*.test.ts", "a.test.ts"), true);
    assert.equal(patternMatches("*.test.ts", "aXtest.ts"), false);
    assert.equal(patternMatches("a+b/*.ts", "a+b/x.ts"), true);
    assert.equal(patternMatches("a+b/*.ts", "aaab/x.ts"), false);
  });
});

describe("patternMatches — ** glob (crosses /)", () => {
  it("** matches runs including /", () => {
    assert.equal(patternMatches("**.ts", "src/deep/index.ts"), true);
    assert.equal(patternMatches("src/**", "src/deep/index.ts"), true);
    assert.equal(patternMatches("src/**/index.ts", "src/a/b/index.ts"), true);
  });

  it("** matches an empty run", () => {
    assert.equal(patternMatches("src/**", "src/"), true);
    assert.equal(patternMatches("a**c", "ac"), true);
  });

  it("** still anchors the whole path", () => {
    assert.equal(patternMatches("src/**", "lib/src/x.ts"), false);
    assert.equal(patternMatches("**/index.ts", "src/index.tsx"), false);
  });

  it("** and * combine in one pattern", () => {
    assert.equal(patternMatches("src/**/*.test.ts", "src/a/b/x.test.ts"), true);
    assert.equal(patternMatches("src/**/*.test.ts", "src/a/b/x.ts"), false);
  });
});

describe("patternMatches — plain patterns (exact or prefix)", () => {
  it("a plain pattern matches the file exactly", () => {
    assert.equal(patternMatches("README.md", "README.md"), true);
    assert.equal(patternMatches("docs/guide.md", "docs/guide.md"), true);
  });

  it("a plain pattern matches files underneath it as a directory", () => {
    assert.equal(patternMatches("docs", "docs/guide.md"), true);
    assert.equal(patternMatches("docs", "docs/deep/guide.md"), true);
  });

  it("a plain pattern does not match a mere string prefix", () => {
    assert.equal(patternMatches("docs", "docsify/guide.md"), false);
    assert.equal(patternMatches("README.md", "README.mdx"), false);
    assert.equal(patternMatches("README.md", "docs/README.md"), false);
  });
});

describe("patternMatches — leading-slash handling", () => {
  it("a leading / on the pattern is stripped", () => {
    assert.equal(patternMatches("/src/", "src/index.ts"), true);
    assert.equal(patternMatches("/README.md", "README.md"), true);
    assert.equal(patternMatches("/*.ts", "index.ts"), true);
  });

  it("a leading / on the file is stripped", () => {
    assert.equal(patternMatches("src/", "/src/index.ts"), true);
    assert.equal(patternMatches("README.md", "/README.md"), true);
  });

  it("leading / on both sides is stripped", () => {
    assert.equal(patternMatches("/docs", "/docs/guide.md"), true);
  });

  it("the winning pattern is reported as supplied, slash included (pinned judgement call)", () => {
    const out = one([{ pattern: "/src/", owners: ["@core"] }], ["src/a.ts"]);
    assert.equal(out.files[0]?.pattern, "/src/");
    assert.deepEqual(out.files[0]?.owners, ["@core"]);
  });
});

describe("mapApprovals — last matching rule wins", () => {
  it("a later specific rule overrides an earlier broad one", () => {
    const out = one(
      [
        { pattern: "src/", owners: ["@core"] },
        { pattern: "src/api/", owners: ["@api"] },
      ],
      ["src/api/handler.ts", "src/util.ts"],
    );
    assert.equal(out.files[0]?.pattern, "src/api/");
    assert.deepEqual(out.files[0]?.owners, ["@api"]);
    assert.equal(out.files[1]?.pattern, "src/");
    assert.deepEqual(out.files[1]?.owners, ["@core"]);
  });

  it("a later broad rule overrides an earlier specific one", () => {
    const out = one(
      [
        { pattern: "src/api/", owners: ["@api"] },
        { pattern: "src/", owners: ["@core"] },
      ],
      ["src/api/handler.ts"],
    );
    assert.equal(out.files[0]?.pattern, "src/");
    assert.deepEqual(out.files[0]?.owners, ["@core"]);
  });

  it("the last of three matching rules wins", () => {
    const out = one(
      [
        { pattern: "**", owners: ["@all"] },
        { pattern: "src/**", owners: ["@src"] },
        { pattern: "src/*.ts", owners: ["@ts"] },
      ],
      ["src/a.ts"],
    );
    assert.equal(out.files[0]?.pattern, "src/*.ts");
    assert.deepEqual(out.files[0]?.owners, ["@ts"]);
  });

  it("owners keep the winning rule's order", () => {
    const out = one(
      [{ pattern: "src/", owners: ["zoe", "@core", "amy"] }],
      ["src/a.ts"],
    );
    assert.deepEqual(out.files[0]?.owners, ["zoe", "@core", "amy"]);
  });

  it("a winning rule with empty owners owns the file with no reviewers required", () => {
    const out = one([{ pattern: "docs/", owners: [] }], ["docs/x.md"]);
    assert.deepEqual(out.files[0], {
      file: "docs/x.md",
      owners: [],
      pattern: "docs/",
      frequent_reviewers: [],
    });
    assert.deepEqual(out.unowned_files, []);
    assert.deepEqual(out.required_reviewers, []);
  });
});

describe("mapApprovals — unowned files and empty inputs", () => {
  it("a file with no matching rule is unowned: owners [], pattern null", () => {
    const out = one([{ pattern: "src/", owners: ["@core"] }], ["README.md"]);
    assert.deepEqual(out.files[0], {
      file: "README.md",
      owners: [],
      pattern: null,
      frequent_reviewers: [],
    });
    assert.deepEqual(out.unowned_files, ["README.md"]);
  });

  it("unowned_files preserves input order and files stay in input order", () => {
    const out = one(
      [{ pattern: "src/", owners: ["@core"] }],
      ["z.md", "src/a.ts", "a.md", "src/b.ts"],
    );
    assert.deepEqual(
      out.files.map((f) => f.file),
      ["z.md", "src/a.ts", "a.md", "src/b.ts"],
    );
    assert.deepEqual(out.unowned_files, ["z.md", "a.md"]);
  });

  it("empty codeowners leaves every file unowned", () => {
    const out = one([], ["a.ts", "b.ts"]);
    assert.deepEqual(out.unowned_files, ["a.ts", "b.ts"]);
    assert.deepEqual(out.required_reviewers, []);
    assert.equal(out.files.length, 2);
    assert.equal(out.files[0]?.pattern, null);
  });

  it("empty reviews (explicit) yields no frequent reviewers", () => {
    const out = one([{ pattern: "src/", owners: ["@core"] }], ["src/a.ts"], []);
    assert.deepEqual(out.files[0]?.frequent_reviewers, []);
  });

  it("omitted reviews defaults to no frequent reviewers", () => {
    const out = one([{ pattern: "src/", owners: ["@core"] }], ["src/a.ts"]);
    assert.deepEqual(out.files[0]?.frequent_reviewers, []);
  });
});

describe("mapApprovals — frequent_reviewers counting and ranking", () => {
  const reviews = [
    { reviewer: "sam", files: ["src/a.ts"] },
    { reviewer: "sam", files: ["src/a.ts", "src/b.ts"] },
    { reviewer: "lee", files: ["src/a.ts"] },
    { reviewer: "lee", files: ["src/b.ts"] },
  ];

  it("counts review entries per reviewer for the exact file", () => {
    const out = one([], ["src/a.ts"], reviews);
    assert.deepEqual(out.files[0]?.frequent_reviewers, [
      { reviewer: "sam", reviews: 2 },
      { reviewer: "lee", reviews: 1 },
    ]);
  });

  it("counts are per file, not global", () => {
    const out = one([], ["src/b.ts"], reviews);
    assert.deepEqual(out.files[0]?.frequent_reviewers, [
      { reviewer: "lee", reviews: 1 },
      { reviewer: "sam", reviews: 1 },
    ]);
  });

  it("only exact file matches count — no prefix or directory credit", () => {
    const out = one(
      [],
      ["src/a.ts"],
      [
        { reviewer: "sam", files: ["src/a.ts.bak"] },
        { reviewer: "lee", files: ["src"] },
        { reviewer: "kim", files: ["src/a.ts"] },
      ],
    );
    assert.deepEqual(out.files[0]?.frequent_reviewers, [
      { reviewer: "kim", reviews: 1 },
    ]);
  });

  it("one entry listing the file twice counts once (pinned judgement call)", () => {
    const out = one(
      [],
      ["src/a.ts"],
      [{ reviewer: "sam", files: ["src/a.ts", "src/a.ts"] }],
    );
    assert.deepEqual(out.files[0]?.frequent_reviewers, [
      { reviewer: "sam", reviews: 1 },
    ]);
  });

  it("ties break by reviewer ascending", () => {
    const out = one(
      [],
      ["x.ts"],
      [
        { reviewer: "zoe", files: ["x.ts"] },
        { reviewer: "amy", files: ["x.ts"] },
        { reviewer: "mia", files: ["x.ts"] },
      ],
    );
    assert.deepEqual(out.files[0]?.frequent_reviewers, [
      { reviewer: "amy", reviews: 1 },
      { reviewer: "mia", reviews: 1 },
      { reviewer: "zoe", reviews: 1 },
    ]);
  });

  it("only the top 3 reviewers are reported", () => {
    const many = [
      { reviewer: "a", files: ["x.ts"] },
      { reviewer: "a", files: ["x.ts"] },
      { reviewer: "a", files: ["x.ts"] },
      { reviewer: "a", files: ["x.ts"] },
      { reviewer: "b", files: ["x.ts"] },
      { reviewer: "b", files: ["x.ts"] },
      { reviewer: "b", files: ["x.ts"] },
      { reviewer: "c", files: ["x.ts"] },
      { reviewer: "c", files: ["x.ts"] },
      { reviewer: "d", files: ["x.ts"] },
      { reviewer: "e", files: ["x.ts"] },
    ];
    const out = one([], ["x.ts"], many);
    assert.deepEqual(out.files[0]?.frequent_reviewers, [
      { reviewer: "a", reviews: 4 },
      { reviewer: "b", reviews: 3 },
      { reviewer: "c", reviews: 2 },
    ]);
  });

  it("a reviewer with several entries on different files is counted per file", () => {
    const out = one(
      [],
      ["a.ts", "b.ts"],
      [{ reviewer: "sam", files: ["a.ts", "b.ts"] }],
    );
    assert.deepEqual(out.files[0]?.frequent_reviewers, [
      { reviewer: "sam", reviews: 1 },
    ]);
    assert.deepEqual(out.files[1]?.frequent_reviewers, [
      { reviewer: "sam", reviews: 1 },
    ]);
  });

  it("review entries with empty files count for nobody", () => {
    const out = one([], ["a.ts"], [{ reviewer: "sam", files: [] }]);
    assert.deepEqual(out.files[0]?.frequent_reviewers, []);
  });
});

describe("mapApprovals — required_reviewers union", () => {
  it("is the distinct union of winning owners, sorted ascending", () => {
    const out = one(
      [
        { pattern: "src/", owners: ["zoe", "@core"] },
        { pattern: "docs/", owners: ["amy", "@core"] },
      ],
      ["src/a.ts", "docs/x.md"],
    );
    assert.deepEqual(out.required_reviewers, ["@core", "amy", "zoe"]);
  });

  it("an owner repeated by one rule appears once", () => {
    const out = one(
      [{ pattern: "src/", owners: ["sam", "sam"] }],
      ["src/a.ts"],
    );
    assert.deepEqual(out.required_reviewers, ["sam"]);
  });

  it("owners of losing rules do not appear", () => {
    const out = one(
      [
        { pattern: "src/", owners: ["@core"] },
        { pattern: "src/", owners: ["@other"] },
      ],
      ["src/a.ts"],
    );
    assert.deepEqual(out.required_reviewers, ["@other"]);
  });

  it("a full result object matches the pinned output shape", () => {
    const out = mapApprovals({
      codeowners: [
        { pattern: "src/", owners: ["@core"] },
        { pattern: "src/api/", owners: ["@api-team", "sam"] },
      ],
      changed_files: ["src/api/handler.ts", "README.md"],
      reviews: [
        { reviewer: "sam", files: ["src/api/handler.ts"] },
        { reviewer: "lee", files: ["src/api/handler.ts"] },
      ],
    });
    assert.deepEqual(out, {
      files: [
        {
          file: "src/api/handler.ts",
          owners: ["@api-team", "sam"],
          pattern: "src/api/",
          frequent_reviewers: [
            { reviewer: "lee", reviews: 1 },
            { reviewer: "sam", reviews: 1 },
          ],
        },
        {
          file: "README.md",
          owners: [],
          pattern: null,
          frequent_reviewers: [],
        },
      ],
      unowned_files: ["README.md"],
      required_reviewers: ["@api-team", "sam"],
    });
  });
});

describe("mapApprovals — validation", () => {
  const throws = (args: unknown, message: string) =>
    assert.throws(() => mapApprovals(args), { message });

  it("codeowners missing names codeowners", () => {
    throws({ changed_files: ["a.ts"] }, "codeowners is required");
    throws({}, "codeowners is required");
    throws(null, "codeowners is required");
    throws([], "codeowners is required");
    throws("nope", "codeowners is required");
  });

  it("codeowners not an array names codeowners", () => {
    throws(
      { codeowners: "src/", changed_files: ["a.ts"] },
      "codeowners must be an array",
    );
    throws(
      { codeowners: null, changed_files: ["a.ts"] },
      "codeowners must be an array",
    );
  });

  it("a codeowners entry that is not an object names its index", () => {
    throws(
      { codeowners: ["src/"], changed_files: ["a.ts"] },
      "codeowners[0] must be an object",
    );
    throws(
      { codeowners: [null], changed_files: ["a.ts"] },
      "codeowners[0] must be an object",
    );
    throws(
      {
        codeowners: [{ pattern: "src/", owners: [] }, 42],
        changed_files: ["a.ts"],
      },
      "codeowners[1] must be an object",
    );
  });

  it("a codeowners pattern missing, empty, or non-string names the pattern path", () => {
    throws(
      { codeowners: [{ owners: [] }], changed_files: ["a.ts"] },
      "codeowners[0].pattern is required",
    );
    throws(
      { codeowners: [{ pattern: "", owners: [] }], changed_files: ["a.ts"] },
      "codeowners[0].pattern must be a non-empty string",
    );
    throws(
      { codeowners: [{ pattern: 7, owners: [] }], changed_files: ["a.ts"] },
      "codeowners[0].pattern must be a non-empty string",
    );
    throws(
      { codeowners: [{ pattern: null, owners: [] }], changed_files: ["a.ts"] },
      "codeowners[0].pattern must be a non-empty string",
    );
  });

  it("codeowners owners missing or not an array names the owners path", () => {
    throws(
      { codeowners: [{ pattern: "src/" }], changed_files: ["a.ts"] },
      "codeowners[0].owners is required",
    );
    throws(
      { codeowners: [{ pattern: "src/", owners: "@core" }], changed_files: ["a.ts"] },
      "codeowners[0].owners must be an array",
    );
    throws(
      { codeowners: [{ pattern: "src/", owners: null }], changed_files: ["a.ts"] },
      "codeowners[0].owners must be an array",
    );
  });

  it("a badly-typed owners entry names its full path", () => {
    throws(
      { codeowners: [{ pattern: "src/", owners: [""] }], changed_files: ["a.ts"] },
      "codeowners[0].owners[0] must be a non-empty string",
    );
    throws(
      { codeowners: [{ pattern: "src/", owners: ["@core", 3] }], changed_files: ["a.ts"] },
      "codeowners[0].owners[1] must be a non-empty string",
    );
  });

  it("changed_files missing, not an array, or empty names changed_files", () => {
    throws({ codeowners: [] }, "changed_files is required");
    throws(
      { codeowners: [], changed_files: "a.ts" },
      "changed_files must be an array",
    );
    throws(
      { codeowners: [], changed_files: [] },
      "changed_files must be a non-empty array",
    );
  });

  it("a changed_files entry non-string or empty names its index", () => {
    throws(
      { codeowners: [], changed_files: [""] },
      "changed_files[0] must be a non-empty string",
    );
    throws(
      { codeowners: [], changed_files: ["a.ts", 9] },
      "changed_files[1] must be a non-empty string",
    );
    throws(
      { codeowners: [], changed_files: [null] },
      "changed_files[0] must be a non-empty string",
    );
  });

  it("reviews present but not an array names reviews", () => {
    throws(
      { codeowners: [], changed_files: ["a.ts"], reviews: "sam" },
      "reviews must be an array",
    );
    throws(
      { codeowners: [], changed_files: ["a.ts"], reviews: null },
      "reviews must be an array",
    );
  });

  it("a reviews entry that is not an object names its index", () => {
    throws(
      { codeowners: [], changed_files: ["a.ts"], reviews: ["sam"] },
      "reviews[0] must be an object",
    );
  });

  it("a reviews reviewer missing, empty, or non-string names the reviewer path", () => {
    throws(
      { codeowners: [], changed_files: ["a.ts"], reviews: [{ files: [] }] },
      "reviews[0].reviewer is required",
    );
    throws(
      { codeowners: [], changed_files: ["a.ts"], reviews: [{ reviewer: "", files: [] }] },
      "reviews[0].reviewer must be a non-empty string",
    );
    throws(
      { codeowners: [], changed_files: ["a.ts"], reviews: [{ reviewer: 5, files: [] }] },
      "reviews[0].reviewer must be a non-empty string",
    );
  });

  it("reviews files missing or not an array names the files path", () => {
    throws(
      { codeowners: [], changed_files: ["a.ts"], reviews: [{ reviewer: "sam" }] },
      "reviews[0].files is required",
    );
    throws(
      {
        codeowners: [],
        changed_files: ["a.ts"],
        reviews: [{ reviewer: "sam", files: "a.ts" }],
      },
      "reviews[0].files must be an array",
    );
  });

  it("a reviews files entry that is not a string names its full path", () => {
    throws(
      {
        codeowners: [],
        changed_files: ["a.ts"],
        reviews: [{ reviewer: "sam", files: ["a.ts", 2] }],
      },
      "reviews[0].files[1] must be a string",
    );
  });

  it("unknown extra fields are ignored at every level (pinned judgement call)", () => {
    const out = mapApprovals({
      codeowners: [{ pattern: "src/", owners: ["@core"], note: "x" }],
      changed_files: ["src/a.ts"],
      reviews: [{ reviewer: "sam", files: ["src/a.ts"], when: "yesterday" }],
      extra: true,
    });
    assert.deepEqual(out.files[0]?.owners, ["@core"]);
    assert.deepEqual(out.files[0]?.frequent_reviewers, [
      { reviewer: "sam", reviews: 1 },
    ]);
  });

  it("no partial result is produced on invalid input", () => {
    assert.throws(() =>
      mapApprovals({
        codeowners: [{ pattern: "src/", owners: ["@core"] }],
        changed_files: ["src/a.ts"],
        reviews: [{ reviewer: "", files: [] }],
      }),
    );
  });
});
