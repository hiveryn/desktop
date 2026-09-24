import type { Intent, IntentInputField } from '@hiveryn/shared/domain';
import { describe, expect, it } from 'vitest';
import {
  awaitsUserInput,
  initialInputValues,
  inputValueErrors,
  parseIntentInputIssues,
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

  it('parses unresolved input issues', () => {
    expect(parseIntentInputIssues([{ field: 'variant', message: 'is required' }])).toEqual([
      { field: 'variant', message: 'is required' },
    ]);
    expect(parseIntentInputIssues(undefined)).toBeUndefined();
    expect(() => parseIntentInputIssues([{ field: 1 }])).toThrow(/malformed/);
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

describe('awaitsUserInput', () => {
  const unresolved = [{ field: 'variant', message: 'is required and has no default' }];

  it('holds allow policies when inputs are unresolved', () => {
    expect(awaitsUserInput(intent({ unresolved_inputs: unresolved }))).toBe(true);
    expect(awaitsUserInput(intent({ policy: 'auto-allow', unresolved_inputs: unresolved }))).toBe(
      true,
    );
  });

  it('does not hold wait-then-deny or resolved intents', () => {
    expect(awaitsUserInput(intent({ policy: 'wait-then-deny', unresolved_inputs: unresolved }))).toBe(
      false,
    );
    expect(awaitsUserInput(intent({}))).toBe(false);
  });
});
