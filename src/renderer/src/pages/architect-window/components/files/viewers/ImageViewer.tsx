import { useEffect, useState } from 'react';
import type { ViewerProps } from '../viewerRegistry';
import BinaryNote from './BinaryNote';
import styles from './Viewers.module.css';

// Renders the already-fetched bytes via a blob URL — same technique as
// MarkdownImage, but for the file itself. Serving svg through <img> also
// inherently disables any embedded scripting.
export default function ImageViewer({ file, text }: ViewerProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Structured-clone bytes are always ArrayBuffer-backed; the cast only
    // narrows away the SharedArrayBuffer half of Uint8Array's generic.
    const bytes = file.bytes as Uint8Array<ArrayBuffer>;
    const objectUrl = URL.createObjectURL(new Blob([bytes], { type: file.contentType }));
    setUrl(objectUrl);
    setFailed(false);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  // The browser couldn't decode it (e.g. TIFF) — fall back to the note.
  if (failed) return <BinaryNote file={file} text={text} />;
  if (!url) return null;

  return (
    <div className={styles.imageViewer}>
      <img src={url} alt={file.path} onError={() => setFailed(true)} />
    </div>
  );
}
