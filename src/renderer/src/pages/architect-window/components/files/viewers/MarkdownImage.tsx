import { useEffect, useState } from 'react';
import styles from './Viewers.module.css';

function isRemoteSrc(src: string): boolean {
  return /^(https?:|data:|blob:)/.test(src);
}

// Resolves a markdown-relative image reference against the markdown file's
// directory, tolerating ./, ../ and URL-encoded names.
export function resolveRelative(dir: string, src: string): string {
  let decoded = src;
  try {
    decoded = decodeURIComponent(src);
  } catch {
    // keep the raw value; the daemon will 404 with the real path in the error
  }
  const base = decoded.startsWith('/') ? decoded : `${dir}/${decoded}`;
  const out: string[] = [];
  for (const part of base.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return `/${out.join('/')}`;
}

interface Props {
  src: string | undefined;
  alt: string | undefined;
  // Directory of the markdown file, for resolving relative references.
  baseDir: string;
}

// Local images can't load via <img src> (the renderer has no filesystem
// access), so relative/absolute paths are fetched through the daemon and
// rendered from a blob URL. Remote URLs pass through untouched.
export default function MarkdownImage({ src, alt, baseDir }: Props) {
  const local = src !== undefined && !isRemoteSrc(src);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!local || src === undefined) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setBlobUrl(null);
    setError(null);
    window.hiveryn.fs.readFile(resolveRelative(baseDir, src)).then(
      (file) => {
        if (cancelled) return;
        // Structured-clone bytes are always ArrayBuffer-backed; the cast only
        // narrows away the SharedArrayBuffer half of Uint8Array's generic.
        const bytes = file.bytes as Uint8Array<ArrayBuffer>;
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: file.contentType }));
        setBlobUrl(objectUrl);
      },
      (err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      },
    );
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [local, src, baseDir]);

  if (src === undefined) return null;
  if (!local) return <img src={src} alt={alt ?? ''} />;
  if (error) {
    return (
      <span className={styles.imageError}>
        [image failed: {src} — {error}]
      </span>
    );
  }
  if (!blobUrl) return <span className={styles.imageLoading}>[loading image: {src}]</span>;
  return <img src={blobUrl} alt={alt ?? ''} />;
}
