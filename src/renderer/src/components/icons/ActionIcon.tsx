import * as React from 'react';

// A play triangle inside a rounded frame: an Action execution.
const ActionIcon: React.FC<React.SVGAttributes<SVGSVGElement>> = (props) => (
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
    <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
    <path d="M6.5 5.75 L10.5 8 L6.5 10.25 Z" strokeLinejoin="round" />
  </svg>
);

export default ActionIcon;
