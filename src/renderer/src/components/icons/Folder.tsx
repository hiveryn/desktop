import * as React from 'react';

const Folder: React.FC<React.SVGAttributes<SVGSVGElement>> = (props) => (
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
    <path d="M1.5 3.5H6L7.5 5.5H14.5V12.5H1.5V3.5Z" />
  </svg>
);

export default Folder;
