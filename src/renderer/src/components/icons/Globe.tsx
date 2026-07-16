import * as React from 'react';

const Globe: React.FC<React.SVGAttributes<SVGSVGElement>> = (props) => (
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
    <circle cx="8" cy="8" r="6" />
    <path d="M2 8H14" />
    <path d="M8 2C9.75 4 9.75 12 8 14C6.25 12 6.25 4 8 2Z" />
  </svg>
);

export default Globe;
