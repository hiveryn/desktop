import * as React from 'react';

const Search: React.FC<React.SVGAttributes<SVGSVGElement>> = (props) => (
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
    <circle cx="7" cy="7" r="3.75" />
    <path d="M9.75 9.75L13 13" />
  </svg>
);

export default Search;
