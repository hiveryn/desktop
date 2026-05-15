import * as React from 'react';
import Glyph from '../Glyph/Glyph';

const Kanban: React.FC<React.HTMLAttributes<HTMLSpanElement>> = (props) => (
  <Glyph {...props}>{'▥'}</Glyph>
);

export default Kanban;
