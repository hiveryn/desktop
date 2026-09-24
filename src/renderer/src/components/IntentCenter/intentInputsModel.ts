import type {
  Intent,
  IntentInputField,
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

/**
 * The form's starting values: each field's default when it is usable, else
 * empty. Defaults only prefill — the daemon never applies them — so a choice
 * default that is not among the options starts unselected and the user picks.
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

/**
 * Whether the intent is deferred: the agent is not waiting on it and nothing
 * resolves it but the user, so there is no countdown. Every intent with inputs
 * is deferred.
 */
export function isDeferred(intent: Intent): boolean {
  return intent.policy === 'manual';
}

// The verb for what a blocking policy does on expiry; auto-allow never raises a
// card and manual never expires.
function autoVerb(policy: Intent['policy']): string | null {
  if (policy === 'wait-then-allow') return 'auto-approve';
  if (policy === 'wait-then-deny') return 'auto-deny';
  return null;
}

/**
 * The card's status label. A blocking intent shows a cosmetic countdown (the
 * daemon's expiry is authoritative, so at zero it waits for the resolved
 * event); a deferred one waits for the user without a timer.
 */
export function intentStatusLabel(intent: Intent, remainingSeconds: number): string {
  if (isDeferred(intent)) return 'awaiting approval';
  if (remainingSeconds <= 0) return 'resolving…';
  const verb = autoVerb(intent.policy);
  return verb ? `${verb} ${remainingSeconds}s` : `${remainingSeconds}s`;
}
