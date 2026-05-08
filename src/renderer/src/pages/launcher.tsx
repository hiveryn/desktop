import {
  ArchitectCard,
  BottomBar,
  Caption,
  Dialog,
  Glyph,
  Input,
  LinkButton,
  Navigation,
  Plus,
  Text,
  ThemeSwitcher,
} from '@hiveryn/components';
import { useEffect, useMemo, useState } from 'react';
import styles from './launcher.module.css';

function titleFromPath(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  return trimmed.split('/').filter(Boolean).at(-1)?.toUpperCase() || 'ARCHITECT';
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path);
}

function expandHomePath(path: string, home: string | null): string {
  if (path === '~') {
    return home ?? path;
  }

  if (path.startsWith('~/')) {
    return home ? `${home}${path.slice(1)}` : path;
  }

  return path;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Something went wrong';
}

export default function Launcher() {
  const [architects, setArchitects] = useState<Architect[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [architectToRemove, setArchitectToRemove] = useState<Architect | null>(null);
  const [path, setPath] = useState('');
  const [daemonHome, setDaemonHome] = useState<string | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadLauncherData() {
      setIsLoading(true);
      setError(null);
      const [itemsResult, homeResult] = await Promise.allSettled([
        window.hiveryn.architects.list(),
        window.hiveryn.system.getHome(),
      ]);

      if (!cancelled) {
        if (itemsResult.status === 'fulfilled') {
          setArchitects(itemsResult.value);
        } else {
          setError(errorMessage(itemsResult.reason));
        }

        if (homeResult.status === 'fulfilled') {
          setDaemonHome(homeResult.value.home);
        }

        setIsLoading(false);
      }
    }

    loadLauncherData();
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedArchitects = useMemo(() => {
    return [...architects].sort((a, b) => {
      const aTime = a.last_opened_at ? new Date(a.last_opened_at).getTime() : 0;
      const bTime = b.last_opened_at ? new Date(b.last_opened_at).getTime() : 0;
      return bTime - aTime;
    });
  }, [architects]);

  const handleOpenArchitect = async (id: string) => {
    setError(null);
    try {
      await window.hiveryn.launcher.openArchitect(id);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const handleRemoveArchitect = (id: string) => {
    const architect = architects.find((item) => item.id === id);
    if (architect) {
      setArchitectToRemove(architect);
      setRemoveError(null);
    }
  };

  const handleCloseRemoveDialog = () => {
    if (isRemoving) {
      return;
    }
    setArchitectToRemove(null);
    setRemoveError(null);
  };

  const handleConfirmRemove = async () => {
    if (!architectToRemove) {
      return;
    }

    setError(null);
    setIsRemoving(true);
    setRemoveError(null);
    try {
      await window.hiveryn.architects.delete(architectToRemove.id);
      setArchitects((items) => items.filter((architect) => architect.id !== architectToRemove.id));
      setArchitectToRemove(null);
    } catch (err) {
      setRemoveError(errorMessage(err));
    } finally {
      setIsRemoving(false);
    }
  };

  const handleCloseDialog = () => {
    if (isRegistering) {
      return;
    }
    setIsDialogOpen(false);
    setPath('');
    setRegisterError(null);
  };

  const handleRegister = async () => {
    const inputPath = path.trim();
    if (!inputPath) {
      setRegisterError('Path is required');
      return;
    }

    const expandedPath = expandHomePath(inputPath, daemonHome);
    if (!isAbsolutePath(expandedPath)) {
      setRegisterError('Path must be absolute');
      return;
    }

    setIsRegistering(true);
    setRegisterError(null);
    try {
      await window.hiveryn.launcher.registerArchitect(expandedPath, titleFromPath(expandedPath));
    } catch (err) {
      setRegisterError(errorMessage(err));
      setIsRegistering(false);
    }
  };

  return (
    <div className={styles.window}>
      <Navigation>
        <Text as="span" className={styles.navTitle}>
          Hiveryn
        </Text>
      </Navigation>

      <main className={styles.content}>
        {error && <Text className={styles.error}>{error}</Text>}

        {isLoading ? (
          <div className={styles.centerState}>
            <Caption as="p">Loading architects</Caption>
          </div>
        ) : sortedArchitects.length === 0 ? (
          <div className={styles.centerState}>
            <Text>No architects registered</Text>
          </div>
        ) : (
          <div className={styles.grid}>
            {sortedArchitects.map((architect) => (
              <ArchitectCard
                key={architect.id}
                architect={architect}
                onOpen={handleOpenArchitect}
                onRemove={handleRemoveArchitect}
              />
            ))}
          </div>
        )}
      </main>

      <BottomBar
        left={
          <LinkButton type="button" onClick={() => setIsDialogOpen(true)}>
            <Glyph>
              <Plus />
            </Glyph>
            REGISTER NEW ARCHITECT
          </LinkButton>
        }
        right={<ThemeSwitcher />}
      />

      {isDialogOpen && (
        <Dialog
          title="REGISTER ARCHITECT"
          onConfirm={handleRegister}
          onCancel={handleCloseDialog}
          confirmLabel={isRegistering ? 'REGISTERING' : 'REGISTER'}
        >
          <div className={styles.dialogBody}>
            <Input
              label="PATH"
              placeholder={
                daemonHome
                  ? `${daemonHome}/architects/my-project`
                  : '/home/user/architects/my-project'
              }
              value={path}
              onChange={(event) => {
                setPath(event.target.value);
                setRegisterError(null);
              }}
              disabled={isRegistering}
            />
            {registerError && (
              <Caption as="p" className={styles.error}>
                {registerError}
              </Caption>
            )}
          </div>
        </Dialog>
      )}

      {architectToRemove && (
        <Dialog
          title="UNREGISTER ARCHITECT"
          onConfirm={handleConfirmRemove}
          onCancel={handleCloseRemoveDialog}
          confirmLabel={isRemoving ? 'UNREGISTERING' : 'UNREGISTER'}
        >
          <div className={styles.dialogBody}>
            <Text>Remove {architectToRemove.title} from this launcher?</Text>
            <Caption as="p">{architectToRemove.path}</Caption>
            {removeError && (
              <Caption as="p" className={styles.error}>
                {removeError}
              </Caption>
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
}
