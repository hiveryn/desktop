import type {
  Intent,
  IntentInputField,
  IntentInputIssue,
  IntentInputOption,
  IntentInputType,
  IntentInputValue,
  IntentInputValues,
} from '@hiveryn/shared/domain';

// Approval inputs: fields the user completes while approving an intent. The
// daemon validates the submitted values and is the authority; the checks here
// only spare the user a round trip, and a daemon rejection keeps the card
// editable so the values can be corrected.

const INPUT_TYPES: readonly IntentInputType[] = ['text', 'textarea', 'choice', 'boolean'];

function malformed(what: string, value: unknown): Error {
  return new Error(`intent/required event has malformed ${what}: ${JSON.stringify(value)}`);
}

function parseOption(raw: unknown): IntentInputOption {
  const o = raw as Record<string, unknown> | null;
  if (!o || typeof o !== 'object' || typeof o.value !== 'string') {
    throw malformed('raw.inputs option', raw);
  }
  return {
    value: o.value,
    label: typeof o.label === 'string' ? o.label : undefined,
    description: typeof o.description === 'string' ? o.description : undefined,
  };
}

function parseField(raw: unknown): IntentInputField {
  const f = raw as Record<string, unknown> | null;
  if (
    !f ||
    typeof f !== 'object' ||
    typeof f.name !== 'string' ||
    typeof f.label !== 'string' ||
    !INPUT_TYPES.includes(f.type as IntentInputType)
  ) {
    throw malformed('raw.inputs field', raw);
  }
  const type = f.type as IntentInputType;
  const expected = type === 'boolean' ? 'boolean' : 'string';
  if (f.default != null && typeof f.default !== expected) {
    throw malformed(`raw.inputs default for "${f.name}"`, f.default);
  }
  if (f.options != null && !Array.isArray(f.options)) {
    throw malformed(`raw.inputs options for "${f.name}"`, f.options);
  }
  return {
    name: f.name,
    label: f.label,
    description: typeof f.description === 'string' ? f.description : undefined,
    type,
    required: f.required === true,
    default: (f.default ?? undefined) as IntentInputValue | undefined,
    options: Array.isArray(f.options) ? f.options.map(parseOption) : undefined,
    max_length: typeof f.max_length === 'number' ? f.max_length : undefined,
  };
}

/** Parses raw.inputs of an intent/required event; absent means no inputs. */
export function parseIntentInputs(raw: unknown): IntentInputField[] | undefined {
  if (raw == null) return undefined;
  if (!Array.isArray(raw)) throw malformed('raw.inputs', raw);
  return raw.length > 0 ? raw.map(parseField) : undefined;
}

/** Parses raw.unresolved_inputs of an intent/required event. */
export function parseIntentInputIssues(raw: unknown): IntentInputIssue[] | undefined {
  if (raw == null) return undefined;
  if (!Array.isArray(raw)) throw malformed('raw.unresolved_inputs', raw);
  const issues = raw.map((item) => {
    const i = item as Record<string, unknown> | null;
    if (!i || typeof i !== 'object' || typeof i.field !== 'string' || typeof i.message !== 'string') {
      throw malformed('raw.unresolved_inputs entry', item);
    }
    return { field: i.field, message: i.message };
  });
  return issues.length > 0 ? issues : undefined;
}

/**
 * The form's starting values: each field's default when it is usable, else
 * empty. A choice default that is not among the options starts unselected —
 * the daemon reports it as unresolved, and the user must pick.
 */
export function initialInputValues(fields: readonly IntentInputField[]): IntentInputValues {
  const values: IntentInputValues = {};
  for (const field of fields) {
    if (field.type === 'boolean') {
      values[field.name] = field.default === true;
      continue;
    }
    const def = typeof field.default === 'string' ? field.default : '';
    values[field.name] =
      field.type === 'choice' && !field.options?.some((o) => o.value === def) ? '' : def;
  }
  return values;
}

/** Client-side mirror of the daemon's checks, keyed by field name. */
export function inputValueErrors(
  fields: readonly IntentInputField[],
  values: IntentInputValues,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const value = values[field.name];
    if (field.type === 'boolean') continue;
    const text = typeof value === 'string' ? value : '';
    if (text.trim() === '') {
      if (field.required) errors[field.name] = 'Required';
      continue;
    }
    if (field.type === 'text' && /[\r\n]/.test(text)) {
      errors[field.name] = 'Must be a single line';
    } else if (field.type === 'choice' && !field.options?.some((o) => o.value === text)) {
      errors[field.name] = 'Choose one of the options';
    } else if (field.max_length && [...text].length > field.max_length) {
      errors[field.name] = `At most ${field.max_length} characters`;
    }
  }
  return errors;
}

/** Whether the daemon will withhold automatic approval until the user answers. */
export function awaitsUserInput(intent: Intent): boolean {
  return (intent.unresolved_inputs?.length ?? 0) > 0 && intent.policy !== 'wait-then-deny';
}
