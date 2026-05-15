import * as React from 'react';
import Glyph from '../Glyph/Glyph';

const Moon: React.FC<React.HTMLAttributes<HTMLSpanElement>> = (props) => (
  <Glyph {...props}>{'☾'}</Glyph>
);

export default Moon;
