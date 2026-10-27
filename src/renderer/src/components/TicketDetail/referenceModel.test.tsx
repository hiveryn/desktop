import type { TicketReference } from '@hiveryn/shared/domain';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReferenceItem } from './ReferenceItem';
import { referenceLabel, referenceView } from './referenceModel';

const repo = (over: Partial<TicketReference>): TicketReference => ({
  value: 'infra:docs/spec.md',
  kind: 'repo',
  owner: 'infra',
  target: 'docs/spec.md',
  exists: false,
  status: 'missing',
  location: 'remote',
  machine: 'bk',
  access: 'readContext',
  ...over,
});

const noop = () => {};

describe('referenceView', () => {
  it('labels an architect workspace file on this Mac with its access route', () => {
    const ref: TicketReference = {
      value: 'architect:investigations/tracing.md',
      kind: 'architect',
      owner: 'architect',
      target: 'investigations/tracing.md',
      exists: true,
      status: 'present',
      location: 'local',
      path_kind: 'file',
      access: 'readContext',
    };
    expect(referenceView(ref)).toMatchObject({ owner: 'architect workspace', state: 'file', where: 'this Mac' });
    expect(referenceLabel(ref)).toBe(
      'architect workspace · architect:investigations/tracing.md · file · on this Mac · via readContext',
    );
  });

  it('names the repo owner and its machine, independently of the ticket', () => {
    const dir = repo({ exists: true, status: 'present', path_kind: 'directory', access: 'listContext' });
    expect(referenceLabel(dir)).toBe('repo infra · infra:docs/spec.md · directory · on machine bk · via listContext');
  });

  it('distinguishes confirmed missing from unverified, and unknown is never local', () => {
    expect(referenceView(repo({}))).toMatchObject({ state: 'missing', error: null, where: 'machine bk' });
    const down = repo({ status: 'unverified', error: 'SSH bk-alias: Connection refused' });
    expect(referenceView(down)).toMatchObject({ state: 'unverified', error: 'SSH bk-alias: Connection refused' });
    const unknown = repo({ status: 'unverified', location: 'unknown', machine: undefined, error: 'no architect' });
    expect(referenceView(unknown).where).toBe('unknown machine');
  });

  it('shows an invalid reference with its remediation and no location or access', () => {
    const invalid: TicketReference = {
      value: '/Users/k/architects/x/notes.md',
      status: 'invalid',
      exists: false,
      error: 'invalid reference "/Users/k/architects/x/notes.md": absolute and home-relative paths are not references',
    };
    const view = referenceView(invalid);
    expect(view).toMatchObject({ owner: 'invalid', state: 'invalid', where: null, access: null, openable: false });
    expect(view.error).toContain('absolute');
    expect(referenceLabel(invalid)).toBe('invalid · /Users/k/architects/x/notes.md · invalid');
  });

  it('keeps ticket-ID references navigable only when they resolve', () => {
    const found: TicketReference = { value: 't-1', kind: 'ticket', status: 'present', exists: true, access: 'readTicket' };
    const gone: TicketReference = { value: 't-2', kind: 'ticket', status: 'missing', exists: false, access: 'readTicket' };
    expect(referenceView(found)).toMatchObject({ openable: true });
    expect(referenceLabel(found)).toBe('ticket · t-1');
    expect(referenceView(gone)).toMatchObject({ openable: false, state: 'missing' });
  });
});

describe('ReferenceItem', () => {
  it('renders architect and repo targets as text with no path actions', () => {
    for (const ref of [repo({ exists: true, status: 'present', path_kind: 'file' }), repo({ location: 'local', machine: undefined })]) {
      const html = renderToStaticMarkup(<ReferenceItem reference={ref} onOpenTicket={noop} />);
      expect(html).toContain('infra:docs/spec.md');
      expect(html).not.toContain('<button');
      expect(html).not.toContain('Reveal in Finder');
      expect(html).not.toContain('Copy path');
    }
  });

  it('shows the daemon error for unverified and invalid references', () => {
    const html = renderToStaticMarkup(
      <ReferenceItem reference={repo({ status: 'unverified', error: 'SSH bk: Connection refused' })} />,
    );
    expect(html).toContain('unverified');
    expect(html).toContain('on machine bk');
    expect(html).toContain('SSH bk: Connection refused');
    expect(html).toContain('data-status="unverified"');
  });

  it('renders a resolving ticket reference as a link', () => {
    const html = renderToStaticMarkup(
      <ReferenceItem
        reference={{ value: 't-1', kind: 'ticket', status: 'present', exists: true, access: 'readTicket' }}
        onOpenTicket={noop}
      />,
    );
    expect(html).toContain('<button');
    expect(html).toContain('ticket · t-1');
  });
});
