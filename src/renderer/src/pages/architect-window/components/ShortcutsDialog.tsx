import { Dialog } from '@components';
import type { ShortcutConfig } from '../../../hooks/useShortcutConfig';
import {
  FILES_BINDING_DEFAULTS,
  GIT_DIFF_BINDING_DEFAULTS,
  resolveBindings,
} from '../../../keys/paneBindings';
import styles from './ShortcutsDialog.module.css';

// Sections in reading order; anything else in the config (e.g. os-global)
// follows alphabetically.
const SECTION_ORDER = ['global', 'kanban', 'event-log', 'ticket', 'files', 'git-diff'];

const SECTION_HINTS: Record<string, string> = {
  global: 'everywhere',
  kanban: 'kanban pane focused',
  'event-log': 'activity pane focused',
  files: 'files pane focused',
  'git-diff': 'git diff pane focused',
  'os-global': 'system-wide',
};

interface Props {
  config: ShortcutConfig;
  onClose(): void;
}

// Read-only listing of the effective keybindings: the daemon's shortcut
// config (~/.hiveryn/shortcuts.yaml) with the desktop's files/git-diff
// defaults layered underneath — exactly what the panes resolve at key time.
export default function ShortcutsDialog({ config, onClose }: Props) {
  const effective: ShortcutConfig = {
    ...config,
    files: resolveBindings(config.files, FILES_BINDING_DEFAULTS),
    'git-diff': resolveBindings(config['git-diff'], GIT_DIFF_BINDING_DEFAULTS),
  };

  const names = Object.keys(effective).sort((a, b) => {
    const ia = SECTION_ORDER.indexOf(a);
    const ib = SECTION_ORDER.indexOf(b);
    return (
      (ia === -1 ? SECTION_ORDER.length : ia) - (ib === -1 ? SECTION_ORDER.length : ib) ||
      a.localeCompare(b)
    );
  });

  return (
    <Dialog title="KEYBOARD SHORTCUTS" onCancel={onClose} cancelLabel="CLOSE">
      <div className={styles.sections}>
        {names.map((name) => {
          const bindings = effective[name];
          const actions = Object.keys(bindings).sort((a, b) => a.localeCompare(b));
          if (actions.length === 0) return null;
          return (
            <section key={name} className={styles.section}>
              <h3 className={styles.sectionTitle}>
                {name}
                {SECTION_HINTS[name] && <span className={styles.hint}>{SECTION_HINTS[name]}</span>}
              </h3>
              <dl className={styles.bindingGrid}>
                {actions.map((action) => (
                  <div key={action} className={styles.binding}>
                    <dt className={styles.action}>{action.replaceAll('-', ' ')}</dt>
                    <dd className={styles.keys}>
                      <kbd className={styles.kbd}>{bindings[action]}</kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        })}
      </div>
      <p className={styles.footnote}>
        Configured in ~/.hiveryn/shortcuts.yaml — served by the daemon, reloaded on window focus.
      </p>
    </Dialog>
  );
}
