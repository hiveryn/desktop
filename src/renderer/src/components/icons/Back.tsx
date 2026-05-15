import * as React from 'react';
import Glyph from '../Glyph/Glyph';

const Back: React.FC<React.HTMLAttributes<HTMLSpanElement>> = (props) => (
  <Glyph {...props}>{'\u2190'}</Glyph>
);

export default Back;
