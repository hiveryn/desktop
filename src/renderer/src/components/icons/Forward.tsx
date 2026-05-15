import * as React from 'react';
import Glyph from '../Glyph/Glyph';

const Forward: React.FC<React.HTMLAttributes<HTMLSpanElement>> = (props) => (
  <Glyph {...props}>{'\u2192'}</Glyph>
);

export default Forward;
