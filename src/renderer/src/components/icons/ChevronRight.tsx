import * as React from 'react';
import Glyph from '../Glyph/Glyph';

const ChevronRight: React.FC<React.HTMLAttributes<HTMLSpanElement>> = (props) => (
  <Glyph {...props}>{'\u25B8'}</Glyph>
);

export default ChevronRight;
