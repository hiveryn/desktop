import * as React from 'react';

const Kanban: React.FC<React.SVGAttributes<SVGSVGElement>> = (props) => (
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
    <rect x="2.5" y="2.5" width="3" height="11" />
    <rect x="6.5" y="2.5" width="3" height="7.5" />
    <rect x="10.5" y="2.5" width="3" height="4" />
  </svg>
);

export default Kanban;
