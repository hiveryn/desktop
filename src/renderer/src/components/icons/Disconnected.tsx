import * as React from 'react';

// A broken link — the SSH connection to a remote worker is down; its activity
// is stale (the remote process may still be running).
const Disconnected: React.FC<React.SVGAttributes<SVGSVGElement>> = (props) => (
  <svg
    viewBox="0 0 16 16"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.25}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    <path d="M6.5 4.5 7.6 3.4a2.5 2.5 0 0 1 3.5 3.5L10 8" />
    <path d="M9.5 11.5 8.4 12.6a2.5 2.5 0 0 1-3.5-3.5L6 8" />
    <path d="M2.5 2.5l11 11" />
  </svg>
);

export default Disconnected;
