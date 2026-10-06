import type { AgentQuestion } from '@hiveryn/shared/domain';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { QuestionCard } from './QuestionPanel';

const question: AgentQuestion = {
  question_id: 'q-1',
  question: 'Deploy to staging first?',
  answers: ['Yes, staging first', 'No, straight to prod'],
  recommended_index: 1,
  origin: { architect_key: '', session_id: 's-1', session_type: 'action', action: 'demo-evidence', execution_id: 'e-1' },
  status: 'pending',
  created_at: '2026-10-06T10:00:00Z',
  expires_at: '2026-10-06T11:00:00Z',
};

describe('QuestionCard', () => {
  it('shows choices with the recommendation marked, none selected, plus free text', () => {
    const html = renderToStaticMarkup(
      <QuestionCard question={question} now={Date.parse('2026-10-06T10:15:00Z')} />,
    );
    expect(html).toContain('action · demo-evidence');
    expect(html).toContain('expires in 45 min');
    expect(html).toContain('Yes, staging first');
    expect(html).not.toContain('aria-checked="true"');
    // The recommendation badge sits on the second answer only.
    expect(html.match(/recommended</g)).toHaveLength(1);
    expect(html.indexOf('recommended<')).toBeGreaterThan(html.indexOf('No, straight to prod'));
    expect(html).toContain('Or write your own answer');
    // Nothing to send until the user chooses or types.
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Send answer/);
    expect(html).toContain('Hide');
    expect(html).not.toContain('Dismiss');
  });

  it('turns into a no-longer-answerable notice without a form', () => {
    const html = renderToStaticMarkup(
      <QuestionCard question={{ ...question, status: 'interrupted', reason: 'the daemon stopped while the question was pending' }} now={0} />,
    );
    expect(html).toContain('No longer answerable: the daemon stopped');
    expect(html).not.toContain('Send answer');
    expect(html).toContain('Dismiss');
  });
});
