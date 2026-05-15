import * as React from 'react';
import Glyph from '../Glyph/Glyph';

const Check: React.FC<React.HTMLAttributes<HTMLSpanElement>> = (props) => (
  <Glyph {...props}>{'\u2713'}</Glyph>
);

export default Check;
