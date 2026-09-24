import type { Intent, IntentInputField } from '@hiveryn/shared/domain';
import { describe, expect, it } from 'vitest';
import {
  initialInputValues,
  inputValueErrors,
  intentStatusLabel,
  isDeferred,
  parseIntentInputs,
} from './intentInputsModel';

const fields: IntentInputField[] = [
  {
    name: 'variant',
    label: 'Agent variant',
    type: 'choice',
    required: true,
    default: 'codex',
    options: [{ value: 'claude-opus', label: 'Claude Opus' }, { value: 'codex' }],
  },
  { name: 'note', label: 'Note', type: 'text', max_length: 5 },
  { name: 'body', label: 'Body', type: 'textarea' },
  { name: 'notify', label: 'Notify', type: 'boolean', default: true },
];

function intent(overrides: Partial<Intent>): Intent {
  return {
    intent_id: 'i-1',
    intent_type: 'createWorkTicket',
    summary: '',
    origin: { architect_key: 'hiveryn', session_id: 's-1', session_type: 'architect' },
    wait_seconds: 20,
    policy: 'wait-then-allow',
    created_at: '2026-09-24T00:00:00Z',
    ...overrides,
  };
}

describe('parseIntentInputs', () => {
  it('parses the schema the daemon publishes in raw.inputs', () => {
    // Shape as encoded by the daemon's IntentInputField JSON tags.
    const raw = JSON.parse(
      JSON.stringify([
        {
          name: 'variant',
          label: 'Agent variant',
          type: 'choice',
          required: true,
          options: [{ value: 'claude-opus', label: 'Claude Opus' }, { value: 'codex' }],
        },
        { name: 'notify', label: 'Notify', type: 'boolean', default: false },
      ]),
    );
    const parsed = parseIntentInputs(raw);
    expect(parsed?.[0]).toMatchObject({ name: 'variant', type: 'choice', required: true });
    expect(parsed?.[0].options?.map((o) => o.value)).toEqual(['claude-opus', 'codex']);
    expect(parsed?.[1]).toMatchObject({ type: 'boolean', default: false, required: false });
  });

  it('treats absent or empty inputs as none', () => {
    expect(parseIntentInputs(undefined)).toBeUndefined();
    expect(parseIntentInputs([])).toBeUndefined();
  });

  it('rejects a malformed schema rather than rendering a wrong form', () => {
    expect(() => parseIntentInputs([{ name: 'x', label: 'X', type: 'date' }])).toThrow(/malformed/);
    expect(() => parseIntentInputs([{ name: 'x', label: 'X', type: 'text', default: 3 }])).toThrow(
      /default/,
    );
    expect(() => parseIntentInputs({})).toThrow(/raw.inputs/);
  });
});

describe('initialInputValues', () => {
  it('prefills usable defaults', () => {
    expect(initialInputValues(fields)).toEqual({
      variant: 'codex',
      note: '',
      body: '',
      notify: true,
    });
  });

  it('leaves a stale choice default unselected', () => {
    const stale = [{ ...fields[0], default: 'gone' }];
    expect(initialInputValues(stale)).toEqual({ variant: '' });
  });
});

describe('inputValueErrors', () => {
  it('accepts valid values', () => {
    expect(inputValueErrors(fields, initialInputValues(fields))).toEqual({});
  });

  it('reports each invalid field', () => {
    expect(
      inputValueErrors(fields, { variant: '', note: 'far too long', body: 'a\nb', notify: false }),
    ).toEqual({ variant: 'Required', note: 'At most 5 characters' });
    expect(inputValueErrors(fields, { variant: 'nope', note: 'a\nb' })).toEqual({
      variant: 'Choose one of the options',
      note: 'Must be a single line',
    });
  });
});

describe('deferred intents', () => {
  const deferred = intent({ policy: 'manual', wait_seconds: 0, inputs: fields });

  it('are recognised by their manual policy', () => {
    expect(isDeferred(deferred)).toBe(true);
    expect(isDeferred(intent({}))).toBe(false);
  });

  it('never show a countdown, whatever their defaults', () => {
    expect(intentStatusLabel(deferred, 0)).toBe('awaiting approval');
    expect(intentStatusLabel(deferred, 20)).toBe('awaiting approval');
  });

  it('prefill defaults without making them the answer', () => {
    // Prefilled, but still the user's explicit submission on approve.
    expect(initialInputValues(deferred.inputs ?? [])).toEqual({
      variant: 'codex',
      note: '',
      body: '',
      notify: true,
    });
  });
});

describe('intentStatusLabel for blocking intents', () => {
  it('counts down by policy and then waits for the daemon', () => {
    expect(intentStatusLabel(intent({}), 12)).toBe('auto-approve 12s');
    expect(intentStatusLabel(intent({ policy: 'wait-then-deny' }), 3)).toBe('auto-deny 3s');
    expect(intentStatusLabel(intent({}), 0)).toBe('resolving…');
  });
});
