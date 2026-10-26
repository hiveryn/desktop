import type { Intent } from '@hiveryn/shared/domain';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@styles/markdown.module.css', () => ({ default: {} }));

const { IntentCard } = await import('./IntentCenter');

const blocking: Intent = {
  intent_id: 'i-1',
  intent_type: 'createWorkTicket',
  summary: 'Run the evidence comparison',
  payload: { repo: 'daemon' },
  origin: { architect_key: 'hiveryn', session_id: 's-1', session_type: 'architect' },
  wait_seconds: 20,
  policy: 'wait-then-allow',
  created_at: '2026-09-24T00:00:00Z',
};

describe('IntentCard', () => {
  it('renders a spawnTicketWorker request with its ticket, variant, workflows and countdown', () => {
    const request: Intent = {
      ...blocking,
      intent_id: 'spawn-1',
      intent_type: 'spawnTicketWorker',
      summary: 'Ship spawn',
      payload: {
        ticket_id: '2026-10-06-0449-ship-spawn',
        repo: 'daemon',
        additional_repos: ['desktop'],
        variant: 'claude-opus',
        workflows: ['AUTONOMOUS_COMMIT', 'ISOLATED_VERIFICATION'],
      },
    };
    const html = renderToStaticMarkup(<IntentCard intent={request} />);
    expect(html).toContain('spawn worker');
    expect(html).toContain('Ship spawn');
    expect(html).toContain('claude-opus');
    expect(html).toContain('desktop');
    expect(html).toContain('AUTONOMOUS_COMMIT, ISOLATED_VERIFICATION');
    expect(html).toContain('auto-approve 20s');

    const none = renderToStaticMarkup(
      <IntentCard intent={{ ...request, payload: { ...request.payload, workflows: [] } }} />,
    );
    expect(none).toMatch(/workflows<\/span><span[^>]*>none</);
  });

  it('shows the countdown', () => {
    expect(renderToStaticMarkup(<IntentCard intent={blocking} />)).toContain('auto-approve 20s');
  });

  it('renders a ticket conclusion with its origin, outcome and auto-approve countdown', () => {
    const conclusion: Intent = {
      intent_id: 'conc-1',
      intent_type: 'concludeSession',
      summary: 'Collector missing',
      payload: {
        body: 'Collector missing',
        outcome: 'failed',
      },
      origin: { architect_key: 'hiveryn', session_id: 's-2', session_type: 'ticket', ticket_id: 'T-9' },
      wait_seconds: 20,
      policy: 'wait-then-allow',
      created_at: '2026-09-25T00:00:00Z',
    };
    const html = renderToStaticMarkup(<IntentCard intent={conclusion} />);
    expect(html).toContain('conclude session');
    expect(html).toContain('hiveryn · T-9');
    expect(html).not.toContain('architect');
    expect(html).toMatch(/data-outcome="failed"/);
    expect(html).toContain('auto-approve 20s');
  });

  it('shows a resolving intent as unanswerable until the daemon reports its outcome', () => {
    const resolving = { ...blocking, resolving: true };
    const html = renderToStaticMarkup(<IntentCard intent={resolving} />);
    expect(html).toContain('resolving…');
    expect(html).toContain('Resolving…');
    expect(html).toContain('the daemon is carrying it out');
    expect(html).not.toContain('auto-approve 20s');
    expect(html).not.toMatch(/>Approve</);
  });

  it('keeps a failed approval as a dismissible notice with its original reason', () => {
    const failed = {
      ...blocking,
      failure: 'remote termination not confirmed on bk; session retained: ssh: killed',
    };
    const html = renderToStaticMarkup(<IntentCard intent={failed} />);
    expect(html).toContain('approved, then failed');
    expect(html).toContain('remote termination not confirmed on bk');
    expect(html).toContain('Dismiss');
    expect(html).not.toContain('Deny');
  });
});
