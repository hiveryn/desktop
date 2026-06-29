import * as React from 'react';

// A steady filled dot — the agent is alive but doing nothing right now.
const AgentIdle: React.FC<React.SVGAttributes<SVGSVGElement>> = (props) => (
  <svg
    viewBox="0 0 16 16"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.25}
    aria-hidden="true"
    {...props}
  >
    <circle cx="8" cy="8" r="2.5" fill="currentColor" stroke="none" />
  </svg>
);

export default AgentIdle;
