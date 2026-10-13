import * as React from 'react';

const WrapLines: React.FC<React.SVGAttributes<SVGSVGElement>> = (props) => (
  <svg
    viewBox="0 0 16 16"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.25}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    <path d="M2.5 4h11" />
    <path d="M2.5 8h9a2 2 0 0 1 0 4H8" />
    <path d="M9.5 10.5 8 12l1.5 1.5" />
    <path d="M2.5 12h3" />
  </svg>
);

export default WrapLines;
