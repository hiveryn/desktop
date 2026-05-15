import * as React from 'react';
import Glyph from '../Glyph/Glyph';

const Refresh: React.FC<React.HTMLAttributes<HTMLSpanElement>> = (props) => (
  <Glyph {...props}>{'\u21BB'}</Glyph>
);

export default Refresh;
