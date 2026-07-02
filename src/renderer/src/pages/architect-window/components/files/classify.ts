import type { FsFileResponse } from '../../../../../../shared/types';
import { languageForPath } from '../../../../components/DiffView/languages';

export type ViewerKind = 'markdown' | 'code' | 'image' | 'binary';

export interface ClassifiedFile {
  kind: ViewerKind;
  // Decoded UTF-8 text for markdown/code; null for binary.
  text: string | null;
  // Refractor language for code files (undefined → plain text rendering).
  language?: string;
}

// Text-bearing media types beyond text/* that Go's http.DetectContentType or
// common servers emit for source/config files.
const TEXT_MEDIA_TYPES = new Set([
  'application/json',
  'application/javascript',
  'application/xml',
  'application/x-sh',
]);

// Extensions treated as text even when the sniffer says octet-stream (sniffing
// only sees the first bytes and misses e.g. empty or unusual-prefix files).
const TEXT_EXTENSIONS = new Set([
  'txt',
  'text',
  'log',
  'toml',
  'ini',
  'cfg',
  'conf',
  'env',
  'gitignore',
  'gitattributes',
  'editorconfig',
  'lock',
  'sum',
  'mod',
  'csv',
  'tsv',
  'html',
  'htm',
  'xml',
  'proto',
  'graphql',
  'prisma',
]);

const MARKDOWN_EXTENSIONS = new Set(['md', 'mdx', 'markdown']);

// Formats the <img> tag can decode. svg is here (not TEXT_EXTENSIONS) so .svg
// files render as images; the sniffer often reports them as text/xml.
const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'bmp',
  'ico',
  'svg',
]);

function mediaType(contentType: string): string {
  return contentType.split(';')[0].trim().toLowerCase();
}

function extensionOf(path: string): string {
  const name = path.split('/').pop() ?? path;
  const idx = name.lastIndexOf('.');
  // Dotfiles like .gitignore: treat the whole trailing name as the extension.
  if (idx <= 0) return name.startsWith('.') ? name.slice(1).toLowerCase() : '';
  return name.slice(idx + 1).toLowerCase();
}

function isTextCandidate(file: FsFileResponse): boolean {
  const media = mediaType(file.contentType);
  if (media.startsWith('text/')) return true;
  if (TEXT_MEDIA_TYPES.has(media)) return true;
  if (media.endsWith('+json') || media.endsWith('+xml')) return true;
  // Sniff-miss rescue: extension says text even though the bytes didn't.
  const ext = extensionOf(file.path);
  return languageForPath(file.path) !== undefined || TEXT_EXTENSIONS.has(ext);
}

function isImage(file: FsFileResponse): boolean {
  return (
    mediaType(file.contentType).startsWith('image/') || IMAGE_EXTENSIONS.has(extensionOf(file.path))
  );
}

export function classify(file: FsFileResponse): ClassifiedFile {
  if (isImage(file)) {
    // Truncated image bytes are corrupt — show the note instead of a broken <img>.
    return { kind: file.truncated ? 'binary' : 'image', text: null };
  }

  if (!isTextCandidate(file)) {
    return { kind: 'binary', text: null };
  }

  // Final gate: the bytes must actually decode as UTF-8.
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(file.bytes);
  } catch {
    return { kind: 'binary', text: null };
  }

  if (MARKDOWN_EXTENSIONS.has(extensionOf(file.path))) {
    return { kind: 'markdown', text };
  }
  return { kind: 'code', text, language: languageForPath(file.path) };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB'];
  let value = bytes;
  let unit = '';
  for (const candidate of units) {
    value /= 1024;
    unit = candidate;
    if (value < 1024) break;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${unit}`;
}
