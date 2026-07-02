export type DiffFileStatus = 'modified' | 'new' | 'deleted' | 'renamed' | 'copied' | 'untracked';

// 'combined' is used for diffs with no staged/unstaged split (e.g. a single-commit diff).
export type DiffSectionKind = 'staged' | 'unstaged' | 'combined';

export interface DiffViewSection {
  kind: DiffSectionKind;
  rawUnifiedDiff: string;
  isBinary: boolean;
  additions: number;
  deletions: number;
  rawDiffBytes: number;
  truncated: boolean;
}

export interface DiffViewFile {
  path: string;
  oldPath?: string;
  status: DiffFileStatus;
  sections: DiffViewSection[];
}
