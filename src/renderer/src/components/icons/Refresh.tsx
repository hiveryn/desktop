import * as React from 'react';

const Refresh: React.FC<React.SVGAttributes<SVGSVGElement>> = (props) => (
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
    <path d="M13 3v3.5h-3.5" />
    <path d="M13 6.5A5 5 0 1 0 13.5 10" />
  </svg>
);

export default Refresh;
