import * as React from 'react';

const Moon: React.FC<React.SVGAttributes<SVGSVGElement>> = (props) => (
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
    <path d="M13 10.5A6 6 0 1 1 5.5 3a5 5 0 0 0 7.5 7.5z" />
  </svg>
);

export default Moon;
