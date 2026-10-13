import type { PathReference, TicketReference } from '@hiveryn/shared/domain';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReferenceItem } from './ReferenceItem';
import { canRevealPath, referenceLabel, referenceView } from './referenceModel';

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
  it('reveals only a path present on this Mac', () => {
    const local = path({ exists: true, status: 'present', kind: 'file' });
    expect(referenceView(local)).toMatchObject({ state: 'file', where: 'this Mac', revealable: true, copyable: true });
    expect(referenceLabel(local)).toBe('path · /srv/spec.md · file · on this Mac');
  });

  it('never reveals a path that lives on another machine, and names it', () => {
    const remote = path({ exists: true, status: 'present', kind: 'directory', location: 'remote', machine: 'bk' });
    expect(canRevealPath(remote)).toBe(false);
    expect(referenceView(remote)).toMatchObject({ revealable: false, copyable: true, where: 'machine bk' });
    expect(referenceLabel(remote)).toBe('path · /srv/spec.md · directory · on machine bk');
  });

  it('treats an unknown location as not local', () => {
    const unknown = path({ status: 'unverified', location: 'unknown', error: 'primary repo "x" is not configured' });
    expect(canRevealPath(unknown)).toBe(false);
    expect(referenceView(unknown)).toMatchObject({
      state: 'unverified',
      where: 'unknown machine',
      error: 'primary repo "x" is not configured',
    });
  });

  it('distinguishes confirmed missing from unverified', () => {
    expect(referenceView(path({ location: 'remote', machine: 'bk' }))).toMatchObject({ state: 'missing', error: null });
    const unverified = path({ status: 'unverified', location: 'remote', machine: 'bk', error: 'Connection refused' });
    expect(referenceView(unverified)).toMatchObject({ state: 'unverified', error: 'Connection refused', revealable: false });
  });

  it('reports a reference without inspection status instead of calling it missing', () => {
    const legacy = { value: '/a', type: 'path', exists: false } as unknown as PathReference;
    const view = referenceView(legacy);
    expect(view.state).toBe('unverified');
    expect(view.revealable).toBe(false);
    expect(view.error).toContain('no inspection status');
    expect(view.where).toContain('unrecognized location');
  });

  it('keeps ticket-ID references navigable only when they resolve', () => {
    const found: TicketReference = { value: 't-1', type: 'ticket', exists: true };
    const gone: TicketReference = { value: 't-2', type: 'ticket', exists: false };
    expect(referenceView(found)).toMatchObject({ openable: true, copyable: false, revealable: false });
    expect(referenceLabel(found)).toBe('ticket · t-1');
    expect(referenceView(gone)).toMatchObject({ openable: false, state: 'missing' });
  });
});

describe('ReferenceItem', () => {
  it('offers Copy path but not Reveal in Finder for a remote path', () => {
    const html = renderToStaticMarkup(
      <ReferenceItem
        reference={path({ exists: true, status: 'present', location: 'remote', machine: 'bk' })}
        onRevealPath={noop}
      />,
    );
    expect(html).toContain('on machine bk');
    expect(html).toContain('Copy path');
    expect(html).not.toContain('Reveal in Finder');
  });

  it('offers Reveal in Finder for a local present path', () => {
    const html = renderToStaticMarkup(
      <ReferenceItem reference={path({ exists: true, status: 'present', kind: 'file' })} onRevealPath={noop} />,
    );
    expect(html).toContain('Reveal in Finder');
    expect(html).toContain('Copy path');
  });

  it('shows the inspection failure for an unverified path', () => {
    const html = renderToStaticMarkup(
      <ReferenceItem
        reference={path({ status: 'unverified', location: 'remote', machine: 'bk', error: 'SSH bk: Connection refused' })}
      />,
    );
    expect(html).toContain('unverified');
    expect(html).toContain('SSH bk: Connection refused');
    expect(html).not.toContain('Reveal in Finder');
  });

  it('renders a resolving ticket reference as a link and nothing to copy', () => {
    const html = renderToStaticMarkup(
      <ReferenceItem reference={{ value: 't-1', type: 'ticket', exists: true }} onOpenTicket={noop} />,
    );
    expect(html).toContain('<button');
    expect(html).not.toContain('Copy path');
  });
});
