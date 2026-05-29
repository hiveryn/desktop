import * as React from 'react';

const TicketIcon: React.FC<React.SVGAttributes<SVGSVGElement>> = (props) => (
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
    <rect x="2" y="3" width="12" height="10" rx="1" />
    <line x1="5" y1="6.5" x2="11" y2="6.5" />
    <line x1="5" y1="9" x2="9" y2="9" />
  </svg>
);

export default TicketIcon;
