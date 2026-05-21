import * as React from 'react';

const Activity: React.FC<React.SVGAttributes<SVGSVGElement>> = (props) => (
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
    <path d="M2 8h2.5l1.5-4 2 8 2-6 1.5 2H14" />
  </svg>
);

export default Activity;
