import * as React from 'react';

const Roadmap: React.FC<React.SVGAttributes<SVGSVGElement>> = (props) => (
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
    <path d="M3.5 13.5v-11" />
    <path d="M3.5 2.5h6l1.5 2 2-.5v6l-2 .5-1.5-2h-6" strokeLinejoin="round" />
  </svg>
);

export default Roadmap;
