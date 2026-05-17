import { ThemeProvider } from '@components';
import React from 'react';
import ReactDOM from 'react-dom/client';
import '@styles/global.css';
import App from './App';
import { setupRendererLogging } from './logging';

const root = document.getElementById('root');

setupRendererLogging();

if (!root) {
  throw new Error('Root element not found');
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
