import type { Ticket } from '@hiveryn/shared/domain';
import type { SessionContext } from '@hiveryn/tabplugin';
import type { Architect } from '../../../shared/types';
import type { SessionRecord } from '../state/sessionStore';

export function buildSessionContext(
  session: SessionRecord,
  architect: Architect,
  ticket: Ticket | null,
): SessionContext {
  return {
    sessionID: session.id,
    sessionType: session.type,
    architectKey: architect.key,
    architectPath: architect.path,
    architectRepos: Object.fromEntries((architect.repos ?? []).map((r) => [r.key, r.path])),
    ticket,
  };
}
