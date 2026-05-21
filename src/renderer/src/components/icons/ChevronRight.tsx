import * as React from 'react';

const ChevronRight: React.FC<React.SVGAttributes<SVGSVGElement>> = (props) => (
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
    <path d="M6 3l5 5-5 5" />
  </svg>
);

export default ChevronRight;
