import * as React from 'react';

const Terminal: React.FC<React.SVGAttributes<SVGSVGElement>> = (props) => (
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
    <path d="M3 4l4 4-4 4M8 12h5" />
  </svg>
);

export default Terminal;
