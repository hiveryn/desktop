import * as React from 'react';
import Glyph from '../Glyph/Glyph';

const Sun: React.FC<React.HTMLAttributes<HTMLSpanElement>> = (props) => (
  <Glyph {...props}>{'☀'}</Glyph>
);

export default Sun;
