import * as React from 'react';
import Glyph from '../Glyph/Glyph';

const Close: React.FC<React.HTMLAttributes<HTMLSpanElement>> = (props) => (
  <Glyph {...props}>{'\u2715'}</Glyph>
);

export default Close;
