import './index.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider } from 'jotai';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme, readStoredTheme } from '@/lib/themes';
import { App } from './App';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

async function initTheme(): Promise<void> {
  const stored = readStoredTheme();
  if (stored) {
    applyTheme(stored);
    return;
  }
  const pref = await window.hiveryn.preferences.getTheme();
  applyTheme(pref === 'light' ? 'light' : 'dark');
  window.hiveryn.preferences.onThemeChange((value) => {
    if (!readStoredTheme()) applyTheme(value === 'light' ? 'light' : 'dark');
  });
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Provider>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </Provider>
  </StrictMode>,
);

void initTheme();
