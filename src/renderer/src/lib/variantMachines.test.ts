import { describe, expect, it } from 'vitest';
import { noVariantMessage, profilesForMachine, scopeMachine } from './variantMachines';

const profiles = [
  { name: 'local-claude' },
  { name: 'bk-codex', machine: 'bk' },
  { name: 'other', machine: 'other' },
];

describe('profilesForMachine', () => {
  it('treats an unassigned variant as local only', () => {
    expect(profilesForMachine(profiles, '').map((p) => p.name)).toEqual(['local-claude']);
    expect(profilesForMachine(profiles, 'bk').map((p) => p.name)).toEqual(['bk-codex']);
    expect(profilesForMachine(profiles, 'nowhere')).toEqual([]);
  });
});

describe('scopeMachine', () => {
  const repos = [
    { key: 'daemon', path: '/d' },
    { key: 'poc', path: '/srv/poc', machine: 'bk' },
    { key: 'lib', path: '/srv/lib', machine: 'bk' },
  ];
  it('derives the shared machine of the writable scope', () => {
    expect(scopeMachine(repos, ['daemon'])).toEqual({ machine: '' });
    expect(scopeMachine(repos, ['poc', 'lib'])).toEqual({ machine: 'bk' });
  });
  it('reports a mixed or unknown scope instead of guessing', () => {
    expect(scopeMachine(repos, ['poc', 'daemon'])).toHaveProperty('problem');
    expect(scopeMachine(repos, ['gone'])).toEqual({ problem: 'repo gone is not configured' });
  });
});

describe('noVariantMessage', () => {
  it('names the target machine', () => {
    expect(noVariantMessage('bk')).toContain('machine: bk');
    expect(noVariantMessage('')).toContain('local');
  });
});
