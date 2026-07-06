import { formatBytes } from '../classify';
import type { ViewerProps } from '../viewerRegistry';
import styles from './Viewers.module.css';

export default function BinaryNote({ file, scrollRef }: ViewerProps) {
  return (
    <div ref={scrollRef} className={styles.binaryNote}>
      <span className={styles.binaryTitle}>Can&rsquo;t preview this file</span>
      <span className={styles.binaryMeta}>
        {file.contentType} · {formatBytes(file.size)}
        {file.truncated ? ' · read truncated at 2 MiB' : ''}
      </span>
    </div>
  );
}
