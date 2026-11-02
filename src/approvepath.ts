/**
 * approvepath core: map the approval path for a pull request.
 *
 *   mapApprovals(args) -> { files, unowned_files, required_reviewers }
 *
 * Pattern matching (pinned subset of CODEOWNERS semantics;
 * paths are compared with any leading "/" stripped from
 * both pattern and file):
 *
 *   - a pattern ending in "/" matches when the file path
 *     starts with the pattern (directory prefix);
 *   - a pattern containing "*" matches by glob: "**"
 *     matches any run of characters including "/", "*"
 *     matches any run of characters except "/"; the whole
 *     file path must match the whole pattern;
 *   - any other pattern matches when the file equals the
 *     pattern, or the file starts with the pattern + "/".
 *
 * The LAST matching rule in codeowners order wins for a
 * file. A file with no matching rule is unowned: owners
 * [] and pattern null.
 *
 * Review history (pinned): for each changed file,
 * frequent_reviewers counts, per reviewer, the number of
 * reviews entries by that reviewer whose files contain
 * the file exactly. Sorted by count descending, then
 * reviewer ascending; the top 3 are reported.
 * required_reviewers is the distinct union of all winning
 * owners across the changed files, sorted ascending.
 * unowned_files lists the changed files with no matching
 * rule, in input order.
 *
 * Validation is strict and path-naming: any malformed input
 * throws an Error naming the offending path (for example
 * "codeowners[0].pattern must be a non-empty string") and
 * no partial result is produced. Unknown extra fields are
 * ignored; a non-object top-level argument is treated
 * as {}.
 */
import type {
  ApprovePathInput,
  ApprovePathResult,
  CodeownersRule,
  FileApproval,
  FrequentReviewer,
  ReviewEntry,
} from "./types.js";

export const VERSION = "0.1.0";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Strip any leading "/" characters from a path or pattern. */
function stripLeadingSlashes(path: string): string {
  return path.replace(/^\/+/, "");
}

/** Escape one character for use in a regular expression. */
function escapeRegExpChar(ch: string): string {
  return /[.*+?^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
}

/**
 * Compile a glob pattern to an anchored regular expression:
 * "**" matches any run of characters including "/", "*"
 * matches any run of characters except "/".
 */
function globToRegExp(pattern: string): RegExp {
  let source = "^";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i] as string;
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        source += ".*";
        i++;
      } else {
        source += "[^/]*";
      }
    } else {
      source += escapeRegExpChar(ch);
    }
  }
  source += "$";
  return new RegExp(source);
}

/**
 * Whether a pattern matches a file, by the pinned rules.
 * Both sides are compared with any leading "/" stripped.
 */
export function patternMatches(pattern: string, file: string): boolean {
  const p = stripLeadingSlashes(pattern);
  const f = stripLeadingSlashes(file);
  if (p.endsWith("/")) return f.startsWith(p);
  if (p.includes("*")) return globToRegExp(p).test(f);
  return f === p || f.startsWith(`${p}/`);
}

/**
 * Validate the raw arguments object and return the
 * normalised input, with reviews defaulted to [].
 */
function validateArgs(args: unknown): ApprovePathInput {
  const raw: Record<string, unknown> = isRecord(args) ? args : {};

  if (raw.codeowners === undefined) throw new Error("codeowners is required");
  if (!Array.isArray(raw.codeowners)) {
    throw new Error("codeowners must be an array");
  }
  const codeowners: CodeownersRule[] = raw.codeowners.map((entry, i) => {
    if (!isRecord(entry)) {
      throw new Error(`codeowners[${i}] must be an object`);
    }
    if (entry.pattern === undefined) {
      throw new Error(`codeowners[${i}].pattern is required`);
    }
    if (typeof entry.pattern !== "string" || entry.pattern.length === 0) {
      throw new Error(`codeowners[${i}].pattern must be a non-empty string`);
    }
    if (entry.owners === undefined) {
      throw new Error(`codeowners[${i}].owners is required`);
    }
    if (!Array.isArray(entry.owners)) {
      throw new Error(`codeowners[${i}].owners must be an array`);
    }
    for (let j = 0; j < entry.owners.length; j++) {
      const owner = entry.owners[j];
      if (typeof owner !== "string" || owner.length === 0) {
        throw new Error(
          `codeowners[${i}].owners[${j}] must be a non-empty string`,
        );
      }
    }
    return { pattern: entry.pattern, owners: entry.owners as string[] };
  });

  if (raw.changed_files === undefined) {
    throw new Error("changed_files is required");
  }
  if (!Array.isArray(raw.changed_files)) {
    throw new Error("changed_files must be an array");
  }
  if (raw.changed_files.length === 0) {
    throw new Error("changed_files must be a non-empty array");
  }
  const changedFiles: string[] = raw.changed_files.map((entry, i) => {
    if (typeof entry !== "string" || entry.length === 0) {
      throw new Error(`changed_files[${i}] must be a non-empty string`);
    }
    return entry;
  });

  let reviews: ReviewEntry[] = [];
  if (raw.reviews !== undefined) {
    if (!Array.isArray(raw.reviews)) {
      throw new Error("reviews must be an array");
    }
    reviews = raw.reviews.map((entry, i) => {
      if (!isRecord(entry)) {
        throw new Error(`reviews[${i}] must be an object`);
      }
      if (entry.reviewer === undefined) {
        throw new Error(`reviews[${i}].reviewer is required`);
      }
      if (typeof entry.reviewer !== "string" || entry.reviewer.length === 0) {
        throw new Error(`reviews[${i}].reviewer must be a non-empty string`);
      }
      if (entry.files === undefined) {
        throw new Error(`reviews[${i}].files is required`);
      }
      if (!Array.isArray(entry.files)) {
        throw new Error(`reviews[${i}].files must be an array`);
      }
      for (let j = 0; j < entry.files.length; j++) {
        if (typeof entry.files[j] !== "string") {
          throw new Error(`reviews[${i}].files[${j}] must be a string`);
        }
      }
      return { reviewer: entry.reviewer, files: entry.files as string[] };
    });
  }

  return { codeowners, changed_files: changedFiles, reviews };
}

/** Count past reviews of one file, per the pinned ranking. */
function frequentReviewers(file: string, reviews: ReviewEntry[]): FrequentReviewer[] {
  const counts = new Map<string, number>();
  for (const entry of reviews) {
    if (entry.files.includes(file)) {
      counts.set(entry.reviewer, (counts.get(entry.reviewer) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([reviewer, count]) => ({ reviewer, reviews: count }))
    .sort(
      (a, b) =>
        b.reviews - a.reviews ||
        (a.reviewer < b.reviewer ? -1 : a.reviewer > b.reviewer ? 1 : 0),
    )
    .slice(0, 3);
}

/** Map the approval path for a pull request. */
export function mapApprovals(args: unknown): ApprovePathResult {
  const { codeowners, changed_files, reviews } = validateArgs(args);

  const files: FileApproval[] = [];
  const unownedFiles: string[] = [];
  const required = new Set<string>();

  for (const file of changed_files) {
    let winner: CodeownersRule | null = null;
    for (const rule of codeowners) {
      if (patternMatches(rule.pattern, file)) winner = rule;
    }
    if (winner === null) {
      unownedFiles.push(file);
      files.push({
        file,
        owners: [],
        pattern: null,
        frequent_reviewers: frequentReviewers(file, reviews),
      });
    } else {
      for (const owner of winner.owners) required.add(owner);
      files.push({
        file,
        owners: [...winner.owners],
        pattern: winner.pattern,
        frequent_reviewers: frequentReviewers(file, reviews),
      });
    }
  }

  return {
    files,
    unowned_files: unownedFiles,
    required_reviewers: [...required].sort(),
  };
}

/** Render a payload as the JSON text block MCP clients show. */
export function formatPayload(payload: unknown): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}
