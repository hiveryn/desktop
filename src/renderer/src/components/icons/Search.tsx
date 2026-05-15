import * as React from 'react';
import Glyph from '../Glyph/Glyph';

const Search: React.FC<React.HTMLAttributes<HTMLSpanElement>> = (props) => (
  <Glyph {...props}>{'\u2315'}</Glyph>
);

export default Search;
