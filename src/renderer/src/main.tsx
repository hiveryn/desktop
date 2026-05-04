import './index.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
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
  const theme = await window.hiveryn.preferences.getTheme();

  function applyTheme(isDark: boolean): void {
    document.documentElement.classList.toggle('dark', isDark);
  }

  if (theme === 'system') {
    applyTheme(window.matchMedia('(prefers-color-scheme: dark)').matches);
  } else {
    applyTheme(theme === 'dark');
  }

  window.hiveryn.preferences.onThemeChange((value: 'dark' | 'light') => {
    applyTheme(value === 'dark');
  });
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);

void initTheme();
