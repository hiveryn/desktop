import styles from '../index.module.css';
import MainTerminalStack from './MainTerminalStack';

// Wide-mode left pane: just hosts the main terminal stack. Always pane-visible.
// The .leftPane layout class is applied by the parent wrapper in ArchitectWindow.
export default function LeftPane() {
  return <MainTerminalStack paneVisible className={styles.terminal} />;
}
