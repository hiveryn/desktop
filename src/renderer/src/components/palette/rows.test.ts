import { describe, expect, it } from 'vitest';
import { buildRows, rowKey } from './rows';

describe('palette actions row', () => {
  it('always offers the Actions window and filters it by query', () => {
    expect(buildRows([], '').map(rowKey)).toEqual(['actions']);
    expect(buildRows([], 'act').map(rowKey)).toEqual(['actions']);
    expect(buildRows([], 'zzz')).toEqual([]);
  });
});
