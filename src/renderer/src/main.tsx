import { ThemeProvider } from '@hiveryn/components';
import React from 'react';
import ReactDOM from 'react-dom/client';
import '@hiveryn/components/styles/global.css';
import App from './App';

const root = document.getElementById('root');

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
