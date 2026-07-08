import * as React from 'react';
import { useErrorCenterStore } from '../../state/errorCenterStore';
import Button from '../Button/Button';
import Card from '../Card/Card';
import Glyph from '../Glyph/Glyph';
import { AlertTriangle } from '../icons';
import Text from '../Text/Text';
import styles from './ErrorBoundary.module.css';

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Compared element-wise (Object.is) on update; a change while in the error
   *  state clears it — e.g. pass the active session id so switching sessions
   *  auto-recovers a stuck pane instead of requiring a manual Retry. */
  resetKeys?: unknown[];
  /** Short label for what crashed, e.g. "Files" — shown in the fallback and
   *  used as the error center entry's title. */
  paneLabel?: string;
  className?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

function resetKeysChanged(prev: unknown[] = [], next: unknown[] = []): boolean {
  if (prev.length !== next.length) return true;
  return prev.some((value, index) => !Object.is(value, next[index]));
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    const label = this.props.paneLabel ?? 'Pane';
    // console.error is already patched by setupRendererLogging() (main.tsx) to
    // forward structurally to the daemon — no separate logging import needed.
    console.error(`[ErrorBoundary] ${label} crashed:`, error, info.componentStack);

    useErrorCenterStore.getState().pushError({
      title: `${label} crashed`,
      message: error.message || String(error),
      stacktrace: [error.stack, info.componentStack].filter(Boolean).join('\n\n'),
      timestamp: Date.now(),
    });
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (this.state.error && resetKeysChanged(prevProps.resetKeys, this.props.resetKeys)) {
      this.setState({ error: null });
    }
  }

  retry = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <ErrorBoundaryFallback
        error={error}
        paneLabel={this.props.paneLabel}
        className={this.props.className}
        onRetry={this.retry}
      />
    );
  }
}

interface FallbackProps {
  error: Error;
  paneLabel?: string;
  className?: string;
  onRetry: () => void;
}

function ErrorBoundaryFallback({ error, paneLabel, className, onRetry }: FallbackProps) {
  const title = paneLabel ? `${paneLabel} crashed` : 'Something went wrong';
  return (
    <div className={[styles.root, className].filter(Boolean).join(' ')}>
      <Card
        role="alert"
        title={title}
        accent="error"
        className={styles.card}
        style={{
          border: '1px solid var(--theme-status-error)',
          background: 'color-mix(in srgb, var(--theme-status-error) 8%, transparent)',
        }}
      >
        <div className={styles.header}>
          <Glyph>
            <AlertTriangle />
          </Glyph>
          <Text as="span" muted>
            This pane was isolated so the rest of the window keeps working.
          </Text>
        </div>
        <Text as="p" className={styles.message}>
          {error.message || String(error)}
        </Text>
        <pre className={styles.stack}>{error.stack}</pre>
        <div className={styles.actions}>
          <Button theme="SECONDARY" onClick={onRetry}>
            Retry
          </Button>
          <Text as="span" muted className={styles.hint}>
            See the error center for details.
          </Text>
        </div>
      </Card>
    </div>
  );
}
