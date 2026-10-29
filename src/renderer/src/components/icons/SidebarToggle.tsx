import * as React from 'react';

// A window with a left panel — collapses/expands the session sidebar.
const SidebarToggle: React.FC<React.SVGAttributes<SVGSVGElement>> = (props) => (
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
    <rect x="2" y="3" width="12" height="10" rx="1" />
    <path d="M6 3v10" />
  </svg>
);

export default SidebarToggle;
