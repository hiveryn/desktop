import * as React from 'react';

// A speech bubble — the agent is blocked, waiting on input/response. Kept
// distinct from the yellow approval-required notify dot.
const AgentWaiting: React.FC<React.SVGAttributes<SVGSVGElement>> = (props) => (
  <svg
    viewBox="0 0 16 16"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.25}
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    <path d="M3 3.5h10a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H7l-2.5 2v-2H3a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z" />
  </svg>
);

export default AgentWaiting;
