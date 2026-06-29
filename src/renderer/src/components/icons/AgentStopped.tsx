import * as React from 'react';

// A muted square — the agent run has stopped (ended or errored). Rendered dimmed
// since TabBar draws the icon without props; the muting is baked in here.
const AgentStopped: React.FC<React.SVGAttributes<SVGSVGElement>> = (props) => (
  <svg
    viewBox="0 0 16 16"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.25}
    strokeLinejoin="round"
    opacity={0.45}
    aria-hidden="true"
    {...props}
  >
    <rect x="4.5" y="4.5" width="7" height="7" rx="1.5" />
  </svg>
);

export default AgentStopped;
