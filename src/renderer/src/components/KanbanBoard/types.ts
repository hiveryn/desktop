export interface TicketWarning {
  code: string;
  message: string;
}

export interface TicketConclusion {
  started_at: string;
  concluded_at: string;
  agent: string;
  profile: string;
  rejected: boolean;
  rejection_reason: string;
  commits: string[];
  body: string;
}

export interface TicketSummary {
  id: string;
  status: 'backlog' | 'progress' | 'done';
  title: string;
  repo: string;
  created: string;
  updated: string;
  references: string[];
  has_conclusion: boolean;
}

export interface Ticket extends TicketSummary {
  warnings: TicketWarning[];
  body: string;
  conclusion: TicketConclusion | null;
}

export interface TicketBoard {
  backlog: TicketSummary[];
  progress: TicketSummary[];
  done: TicketSummary[];
}
