import * as React from 'react';

const Keyboard: React.FC<React.SVGAttributes<SVGSVGElement>> = (props) => (
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
    <rect x="1.5" y="4" width="13" height="8" />
    <path d="M4 6.5h.01M6.5 6.5h.01M9 6.5h.01M11.5 6.5h.01M4 9.5h8" strokeLinecap="round" />
  </svg>
);

export default Keyboard;
