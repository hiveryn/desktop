import { BottomBar, Button, ThemeSwitcher } from '@hiveryn/components';
import styles from './App.module.css';

export default function App() {
  return (
    <div className={styles.root}>
      <h1 className={styles.title}>Hi</h1>
      <div className={styles.buttonWrap}>
        <Button>Click me</Button>
      </div>

      <BottomBar right={<ThemeSwitcher />} />
    </div>
  );
}
