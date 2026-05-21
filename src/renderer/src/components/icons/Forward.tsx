import * as React from 'react';

const Forward: React.FC<React.SVGAttributes<SVGSVGElement>> = (props) => (
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
    <path d="M3 8h10M9 4l4 4-4 4" />
  </svg>
);

export default Forward;
