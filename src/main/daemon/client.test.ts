import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// The daemon stand-in answers after `?delay=` milliseconds.
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    const delay = Number(new URL(req.url ?? '/', 'http://x').searchParams.get('delay') ?? 0);
    setTimeout(() => {
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          data: { ok: true },
          error: null,
          logs: [],
          commands: [],
          meta: { request_id: 'r' },
        }),
      );
    }, delay);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  vi.stubEnv('HIVERYN_DAEMON_URL', baseUrl);
});

afterAll(() => {
  server.closeAllConnections();
  server.close();
  vi.unstubAllEnvs();
});

async function client() {
  // DAEMON_URL is read at import, after the stub.
  return import('./client');
}

describe('daemonFetch', () => {
  it('reports an exceeded bound as TIMEOUT naming the request', async () => {
    const { daemonFetch } = await client();
    const result = await daemonFetch('/api/slow?delay=500', { method: 'POST' }, { timeoutMs: 100 });
    expect(result.httpStatus).toBe(0);
    expect(result.envelope.error?.code).toBe('TIMEOUT');
    expect(result.envelope.error?.message).toBe(
      'The daemon did not answer POST /api/slow?delay=500 within 0.1s',
    );
  });

  it('lets a call that legitimately takes longer pass its own bound', async () => {
    const { daemonFetch, DEFAULT_DAEMON_TIMEOUT_MS } = await client();
    const delay = DEFAULT_DAEMON_TIMEOUT_MS + 1000;
    const result = await daemonFetch(
      `/api/slow?delay=${delay}`,
      { method: 'POST' },
      {
        timeoutMs: delay + 5000,
      },
    );
    expect(result.httpStatus).toBe(201);
    expect(result.envelope.data).toEqual({ ok: true });
  }, 15_000);

  it('keeps an unreachable daemon a NETWORK_ERROR', async () => {
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
    const port = (closed.address() as AddressInfo).port;
    await new Promise<void>((resolve) => closed.close(() => resolve()));
    // DAEMON_URL is read at import: load a fresh copy aimed at the closed port.
    vi.stubEnv('HIVERYN_DAEMON_URL', `http://127.0.0.1:${port}`);
    vi.resetModules();
    const { daemonFetch } = await client();
    vi.stubEnv('HIVERYN_DAEMON_URL', baseUrl);
    vi.resetModules();
    const result = await daemonFetch('/api/health');
    expect(result.envelope.error?.code).toBe('NETWORK_ERROR');
  });
});
