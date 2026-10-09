import type { Intent } from '@hiveryn/shared/domain';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@styles/markdown.module.css', () => ({ default: {} }));

const { IntentCard } = await import('./IntentCenter');

const deferred: Intent = {
  intent_id: 'i-1',
  intent_type: 'createWorkTicket',
  summary: 'Run the evidence comparison',
  payload: { repo: 'daemon' },
  inputs: [
    {
      name: 'variant',
      label: 'Agent variant',
      type: 'choice',
      required: true,
      default: 'codex',
      options: [{ value: 'claude-opus', label: 'Claude Opus' }, { value: 'codex' }],
    },
    { name: 'note', label: 'Note', type: 'text' },
  ],
  origin: { architect_key: 'hiveryn', session_id: 's-1', session_type: 'architect' },
  wait_seconds: 0,
  policy: 'manual',
  created_at: '2026-09-24T00:00:00Z',
};

describe('IntentCard', () => {
  it('renders a deferred request as a prefilled form with no countdown', () => {
    const html = renderToStaticMarkup(<IntentCard intent={deferred} />);
    expect(html).toContain('awaiting approval');
    expect(html).not.toMatch(/auto-approve|auto-deny|resolving/);
    expect(html).toContain('Agent variant');
    // The default only prefills the choice.
    expect(html).toMatch(/<option value="codex" selected="">/);
    expect(html).toContain('Approve');
    expect(html).toContain('Deny');
  });

  it('renders an executeAction request with its action, variant, prompt and countdown and no form', () => {
    const request: Intent = {
      ...deferred,
      intent_id: 'exec-1',
      intent_type: 'executeAction',
      summary: 'Run demo-evidence',
      payload: { action: 'demo-evidence', variant: 'claude-opus', prompt: 'Compare AMS and LDN three times' },
      inputs: undefined,
      policy: 'wait-then-allow',
      wait_seconds: 20,
    };
    const html = renderToStaticMarkup(<IntentCard intent={request} />);
    expect(html).toContain('run action');
    expect(html).toContain('demo-evidence');
    expect(html).toContain('claude-opus');
    expect(html).toContain('Compare AMS and LDN three times');
    expect(html).toContain('auto-approve 20s');
    // The variant is reviewable information, not an approval input.
    expect(html).not.toContain('<select');
    expect(html).not.toContain('Agent variant</label>');
    expect(html).toContain('Approve');
    expect(html).toContain('Deny');
  });

  it('renders a spawnTicketWorker request with its ticket, variant, workflows and countdown', () => {
    const request: Intent = {
      ...deferred,
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
      inputs: undefined,
      policy: 'wait-then-allow',
      wait_seconds: 20,
    };
    const html = renderToStaticMarkup(<IntentCard intent={request} />);
    expect(html).toContain('spawn worker');
    expect(html).toContain('Ship spawn');
    expect(html).toContain('claude-opus');
    expect(html).toContain('desktop');
    expect(html).toContain('AUTONOMOUS_COMMIT, ISOLATED_VERIFICATION');
    expect(html).toContain('auto-approve 20s');
    expect(html).not.toContain('<select');

    const none = renderToStaticMarkup(
      <IntentCard intent={{ ...request, payload: { ...request.payload, workflows: [] } }} />,
    );
    expect(none).toMatch(/workflows<\/span><span[^>]*>none</);
  });

  it('keeps the countdown for a blocking request', () => {
    const blocking: Intent = { ...deferred, inputs: undefined, policy: 'wait-then-allow', wait_seconds: 20 };
    expect(renderToStaticMarkup(<IntentCard intent={blocking} />)).toContain('auto-approve 20s');
  });

  it('renders an Action conclusion with its action, outcome and auto-approve countdown', () => {
    const conclusion: Intent = {
      intent_id: 'conc-1',
      intent_type: 'concludeSession',
      summary: 'Collector missing',
      payload: {
        body: 'Collector missing',
        outcome: 'failed',
        action: 'demo-evidence',
        execution_id: 'run-1',
        output_dir: '/out/run-1',
      },
      origin: { architect_key: '', session_id: 's-2', session_type: 'action' },
      wait_seconds: 20,
      policy: 'wait-then-allow',
      created_at: '2026-09-25T00:00:00Z',
    };
    const html = renderToStaticMarkup(<IntentCard intent={conclusion} />);
    expect(html).toContain('conclude session');
    expect(html).toContain('action · demo-evidence');
    expect(html).not.toContain('architect');
    expect(html).toMatch(/data-outcome="failed"/);
    expect(html).toContain('auto-approve 20s');
  });

  it('shows a resolving intent as unanswerable until the daemon reports its outcome', () => {
    const resolving = { ...deferred, inputs: undefined, policy: 'wait-then-allow' as const, wait_seconds: 20, resolving: true };
    const html = renderToStaticMarkup(<IntentCard intent={resolving} />);
    expect(html).toContain('resolving…');
    expect(html).toContain('Resolving…');
    expect(html).toContain('the daemon is carrying it out');
    expect(html).not.toContain('auto-approve 20s');
    expect(html).not.toMatch(/>Approve</);
  });

  it('keeps a failed approval as a dismissible notice with its original reason', () => {
    const failed = {
      ...deferred,
      inputs: undefined,
      policy: 'wait-then-allow' as const,
      failure: 'remote termination not confirmed on bk; session retained: ssh: killed',
    };
    const html = renderToStaticMarkup(<IntentCard intent={failed} />);
    expect(html).toContain('approved, then failed');
    expect(html).toContain('remote termination not confirmed on bk');
    expect(html).toContain('Dismiss');
    expect(html).not.toContain('Deny');
  });
});
