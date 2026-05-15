import * as React from 'react';
import Glyph from '../Glyph/Glyph';

const Terminal: React.FC<React.HTMLAttributes<HTMLSpanElement>> = ({ style, ...props }) => (
  <Glyph style={{ fontSize: '0.75em', ...style }} {...props}>{'❯'}</Glyph>
);

export default Terminal;
