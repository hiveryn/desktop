import * as React from 'react';

const AlertTriangle: React.FC<React.SVGAttributes<SVGSVGElement>> = (props) => (
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
    <path d="M8 1.5 15 14.5H1L8 1.5Z" strokeLinecap="round" />
    <path d="M8 6v4" strokeLinecap="round" />
    <circle cx="8" cy="12.25" r="0.75" fill="currentColor" stroke="none" />
  </svg>
);

export default AlertTriangle;
