import * as React from 'react';
import Glyph from '../Glyph/Glyph';

const Settings: React.FC<React.HTMLAttributes<HTMLSpanElement>> = (props) => (
  <Glyph {...props}>{'\u2699'}</Glyph>
);

export default Settings;
