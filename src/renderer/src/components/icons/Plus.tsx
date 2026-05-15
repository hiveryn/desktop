import * as React from 'react';
import Glyph from '../Glyph/Glyph';

const Plus: React.FC<React.HTMLAttributes<HTMLSpanElement>> = ({ style, ...props }) => (
  <Glyph style={{ fontSize: '1.2em', ...style }} {...props}>{'+'}</Glyph>
);

export default Plus;
