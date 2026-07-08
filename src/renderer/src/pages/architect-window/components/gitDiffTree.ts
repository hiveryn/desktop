import type { RepoDiffFile } from '../../../../../shared/types';

// In-memory tree over a repo diff's changed-file paths. Unlike the files
// explorer's fetch-driven tree, the full file set is already in hand, so this
// is a pure split-paths → nested-nodes transform, flattened to visible rows
// the same way the explorer does (keyboard nav and rendering walk one list).

export interface DiffTreeDir {
  kind: 'dir';
  /** Full path prefix from the repo root, no trailing slash — row/collapse key. */
  path: string;
  /**
   * Display label with trailing slash. Single-child directory chains are
   * compressed into one node ("renderer/src/pages/"), so a label can span
   * several path segments.
   */
  label: string;
  children: DiffTreeNode[];
}

export interface DiffTreeFile {
  kind: 'file';
  /** Basename of the changed file. */
  name: string;
  file: RepoDiffFile;
}

export type DiffTreeNode = DiffTreeDir | DiffTreeFile;

export interface DiffTreeRow {
  /** Dir path or file path — unique across the tree. */
  key: string;
  depth: number;
  /** Key of the containing directory row (null at the root level). */
  parentKey: string | null;
  node: DiffTreeNode;
  /** Dirs only: whether the row's children are currently visible. */
  expanded?: boolean;
}

interface MutableDir {
  dirs: Map<string, MutableDir>;
  files: RepoDiffFile[];
}

export function buildDiffTree(files: RepoDiffFile[]): DiffTreeNode[] {
  const root: MutableDir = { dirs: new Map(), files: [] };
  for (const file of files) {
    const segments = file.path.split('/');
    let dir = root;
    for (const segment of segments.slice(0, -1)) {
      let next = dir.dirs.get(segment);
      if (!next) {
        next = { dirs: new Map(), files: [] };
        dir.dirs.set(segment, next);
      }
      dir = next;
    }
    dir.files.push(file);
  }
  return toNodes(root, '');
}

function toNodes(dir: MutableDir, pathPrefix: string): DiffTreeNode[] {
  const dirNodes = [...dir.dirs.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, child]): DiffTreeDir => {
      let label = `${name}/`;
      let path = pathPrefix === '' ? name : `${pathPrefix}/${name}`;
      let node = child;
      // Compress single-child directory chains (no files, exactly one
      // subdirectory) into one row — diff trees are sparse, and without this
      // deep repos open several levels of pure nesting before any file.
      while (node.files.length === 0 && node.dirs.size === 1) {
        const [childName, grandchild] = node.dirs.entries().next().value as [string, MutableDir];
        label += `${childName}/`;
        path += `/${childName}`;
        node = grandchild;
      }
      return { kind: 'dir', path, label, children: toNodes(node, path) };
    });

  const fileNodes = [...dir.files]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map(
      (file): DiffTreeFile => ({
        kind: 'file',
        name: file.path.slice(file.path.lastIndexOf('/') + 1),
        file,
      }),
    );

  return [...dirNodes, ...fileNodes];
}

export function flattenDiffTree(
  nodes: DiffTreeNode[],
  collapsedDirs: ReadonlySet<string>,
): DiffTreeRow[] {
  const rows: DiffTreeRow[] = [];
  const walk = (children: DiffTreeNode[], depth: number, parentKey: string | null): void => {
    for (const node of children) {
      if (node.kind === 'dir') {
        const expanded = !collapsedDirs.has(node.path);
        rows.push({ key: node.path, depth, parentKey, node, expanded });
        if (expanded) walk(node.children, depth + 1, node.path);
      } else {
        rows.push({ key: node.file.path, depth, parentKey, node });
      }
    }
  };
  walk(nodes, 0, null);
  return rows;
}
