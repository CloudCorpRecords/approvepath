/**
 * approvepath types.
 *
 * approvepath maps the approval path for one pull request.
 * The caller supplies the CODEOWNERS rules in file order,
 * the paths the PR changes, and optionally past review
 * activity. From that data alone, as pure local computation,
 * approvepath reports:
 *
 *   - one entry per changed file, in input order, with the
 *     owners the winning rule assigns, the winning pattern,
 *     and the reviewers who have actually reviewed that
 *     file before
 *   - the changed files no rule matched
 *   - the distinct union of all winning owners
 *
 * Pattern matching is a pinned subset of CODEOWNERS
 * semantics: any leading "/" is stripped from both pattern
 * and file, a pattern ending in "/" is a directory prefix,
 * a pattern containing "*" is a glob ("**" crosses "/",
 * "*" does not), and any other pattern matches exactly or
 * as a directory prefix. The last matching rule wins.
 */

/** One CODEOWNERS rule, as supplied. */
export interface CodeownersRule {
  /** Path pattern to match changed files against; non-empty. */
  pattern: string;
  /** Owners assigned when this rule wins; entries non-empty. */
  owners: string[];
}

/** One past review activity entry, as supplied. */
export interface ReviewEntry {
  /** Reviewer name; non-empty. */
  reviewer: string;
  /** Files this review entry covered. */
  files: string[];
}

/** The arguments accepted by mapApprovals, after validation. */
export interface ApprovePathInput {
  /** CODEOWNERS rules in file order; may be empty. */
  codeowners: CodeownersRule[];
  /** Paths of the files the PR changes; non-empty. */
  changed_files: string[];
  /** Past review activity; defaults to []. */
  reviews: ReviewEntry[];
}

/** One reviewer's history on a single changed file. */
export interface FrequentReviewer {
  /** Reviewer name. */
  reviewer: string;
  /** How many review entries by this reviewer cover the file. */
  reviews: number;
}

/** The approval mapping for one changed file. */
export interface FileApproval {
  /** The changed file path, as supplied. */
  file: string;
  /** The winning rule's owners, in rule order; [] when unowned. */
  owners: string[];
  /** The winning rule's pattern, as supplied; null when unowned. */
  pattern: string | null;
  /** Up to three reviewers of this file, most frequent first. */
  frequent_reviewers: FrequentReviewer[];
}

/** The approval map for a pull request. */
export interface ApprovePathResult {
  /** One entry per changed file, in input order. */
  files: FileApproval[];
  /** Changed files with no matching rule, in input order. */
  unowned_files: string[];
  /** Distinct union of all winning owners, sorted ascending. */
  required_reviewers: string[];
}
