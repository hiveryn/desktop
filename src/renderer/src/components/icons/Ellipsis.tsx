import * as React from 'react';
import Glyph from '../Glyph/Glyph';

const Ellipsis: React.FC<React.HTMLAttributes<HTMLSpanElement>> = (props) => (
  <Glyph {...props}>{'\u2026'}</Glyph>
);

export default Ellipsis;
