import * as React from 'react';

const GitDiff: React.FC<React.SVGAttributes<SVGSVGElement>> = (props) => (
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
    <circle cx="4" cy="3" r="1.5" />
    <circle cx="4" cy="13" r="1.5" />
    <circle cx="12" cy="8" r="1.5" />
    <path d="M4 4.5V11.5" />
    <path d="M4 6.5C4 8 5 8 6.5 8H10.5" />
    <path d="M9 6.5L10.5 8L9 9.5" />
  </svg>
);

export default GitDiff;
