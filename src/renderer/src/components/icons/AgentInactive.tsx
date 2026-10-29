import * as React from 'react';

// A dashed empty circle — nothing is running (an architect with no running
// architect session). Distinct from AgentStopped, a run that ended.
const AgentInactive: React.FC<React.SVGAttributes<SVGSVGElement>> = (props) => (
  <svg
    viewBox="0 0 16 16"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.25}
    strokeDasharray="2 2"
    opacity={0.6}
    aria-hidden="true"
    {...props}
  >
    <circle cx="8" cy="8" r="4.5" />
  </svg>
);

export default AgentInactive;
