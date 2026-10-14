import type { PathReference, TicketReference } from '@hiveryn/shared/domain';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReferenceItem } from './ReferenceItem';
import { referenceLabel, referenceView } from './referenceModel';

const path = (over: Partial<PathReference>): PathReference => ({
  value: '/srv/spec.md',
  type: 'path',
  exists: false,
  status: 'missing',
  location: 'local',
  ...over,
});

const noop = () => {};

describe('referenceView', () => {
  it('labels a path present on this Mac', () => {
    const local = path({ exists: true, status: 'present', kind: 'file' });
    expect(referenceView(local)).toMatchObject({ state: 'file', where: 'this Mac', openable: false });
    expect(referenceLabel(local)).toBe('path · /srv/spec.md · file · on this Mac');
  });

  it('names the machine of a path that lives elsewhere', () => {
    const remote = path({ exists: true, status: 'present', kind: 'directory', location: 'remote', machine: 'bk' });
    expect(referenceView(remote)).toMatchObject({ where: 'machine bk' });
    expect(referenceLabel(remote)).toBe('path · /srv/spec.md · directory · on machine bk');
  });

  it('treats an unknown location as not local', () => {
    const unknown = path({ status: 'unverified', location: 'unknown', error: 'primary repo "x" is not configured' });
    expect(referenceView(unknown)).toMatchObject({
      state: 'unverified',
      where: 'unknown machine',
      error: 'primary repo "x" is not configured',
    });
  });

  it('distinguishes confirmed missing from unverified', () => {
    expect(referenceView(path({ location: 'remote', machine: 'bk' }))).toMatchObject({ state: 'missing', error: null });
    const unverified = path({ status: 'unverified', location: 'remote', machine: 'bk', error: 'Connection refused' });
    expect(referenceView(unverified)).toMatchObject({ state: 'unverified', error: 'Connection refused' });
  });

  it('reports a reference without inspection status instead of calling it missing', () => {
    const legacy = { value: '/a', type: 'path', exists: false } as unknown as PathReference;
    const view = referenceView(legacy);
    expect(view.state).toBe('unverified');
    expect(view.error).toContain('no inspection status');
    expect(view.where).toContain('unrecognized location');
  });

  it('keeps ticket-ID references navigable only when they resolve', () => {
    const found: TicketReference = { value: 't-1', type: 'ticket', exists: true };
    const gone: TicketReference = { value: 't-2', type: 'ticket', exists: false };
    expect(referenceView(found)).toMatchObject({ openable: true });
    expect(referenceLabel(found)).toBe('ticket · t-1');
    expect(referenceView(gone)).toMatchObject({ openable: false, state: 'missing' });
  });
});

describe('ReferenceItem', () => {
  it('renders a path as text with no path actions, local or remote', () => {
    for (const ref of [
      path({ exists: true, status: 'present', kind: 'file' }),
      path({ exists: true, status: 'present', location: 'remote', machine: 'bk' }),
    ]) {
      const html = renderToStaticMarkup(<ReferenceItem reference={ref} onOpenTicket={noop} />);
      expect(html).toContain('/srv/spec.md');
      expect(html).not.toContain('<button');
      expect(html).not.toContain('Reveal in Finder');
      expect(html).not.toContain('Copy path');
    }
  });

  it('shows the inspection failure for an unverified path', () => {
    const html = renderToStaticMarkup(
      <ReferenceItem
        reference={path({ status: 'unverified', location: 'remote', machine: 'bk', error: 'SSH bk: Connection refused' })}
      />,
    );
    expect(html).toContain('unverified');
    expect(html).toContain('on machine bk');
    expect(html).toContain('SSH bk: Connection refused');
  });

  it('renders a resolving ticket reference as a link', () => {
    const html = renderToStaticMarkup(
      <ReferenceItem reference={{ value: 't-1', type: 'ticket', exists: true }} onOpenTicket={noop} />,
    );
    expect(html).toContain('<button');
    expect(html).toContain('ticket · t-1');
  });
});
