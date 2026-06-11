import React from 'react';
import ReactDOM from 'react-dom/client';
import '@styles/global.css';
import App from './App';
import { setupRendererLogging } from './logging';

const root = document.getElementById('root');

setupRendererLogging();

// Eagerly load the Nerd Font symbols face. Font faces normally load on first
// glyph use, which would flash tofu boxes the first time a TUI prints icons.
void document.fonts.load('1em "Symbols Nerd Font Mono"');

if (!root) {
  throw new Error('Root element not found');
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
