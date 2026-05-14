import styles from '../index.module.css';
import MainTerminalStack from './MainTerminalStack';

// Wide-mode left pane: just hosts the main terminal stack. Always pane-visible.
export default function LeftPane() {
  return (
    <div className={styles.leftPane}>
      <MainTerminalStack paneVisible className={styles.terminal} />
    </div>
  );
}
