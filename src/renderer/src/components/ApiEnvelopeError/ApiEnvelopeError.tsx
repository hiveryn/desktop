import type { CSSProperties } from 'react';
import styles from './ApiEnvelopeError.module.css';

interface EnvelopeLikeError extends Error {
  status?: number;
  code?: string;
  details?: unknown;
  stacktrace?: string;
}

interface ApiEnvelopeErrorProps {
  error: unknown;
  title?: string;
  className?: string;
  style?: CSSProperties;
}

function normalizeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const envelopeError = error as EnvelopeLikeError;
    return {
      message: error.message,
      status: envelopeError.status,
      code: envelopeError.code,
      details: envelopeError.details,
      stacktrace: envelopeError.stacktrace,
      stack: error.stack,
    };
  }

  return { message: String(error) };
}

function errorTitle(error: unknown): string {
  if (error instanceof Error) {
    const envelopeError = error as EnvelopeLikeError;
    return envelopeError.code ? `${envelopeError.code}: ${error.message}` : error.message;
  }
  return String(error);
}

export default function ApiEnvelopeError({
  error,
  title = 'API Error',
  className,
  style,
}: ApiEnvelopeErrorProps) {
  return (
    <section className={[styles.root, className].filter(Boolean).join(' ')} style={style} role="alert">
      <div className={styles.header}>{title}</div>
      <div className={styles.message}>{errorTitle(error)}</div>
      <pre className={styles.body}>{JSON.stringify(normalizeError(error), null, 2)}</pre>
    </section>
  );
}
