import * as React from 'react';

interface ThemeContextValue {
  isDark: boolean;
  setTheme: (dark: boolean) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = 'theme';

function readStored(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light') return false;
  return true;
}

function applyClass(isDark: boolean) {
  if (typeof document === 'undefined') return;
  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

function persist(isDark: boolean) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, isDark ? 'dark' : 'light');
}

interface ThemeProviderProps {
  children?: React.ReactNode;
}

const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [isDark, setIsDark] = React.useState<boolean>(readStored);

  const setTheme = React.useCallback((dark: boolean) => {
    setIsDark(dark);
    applyClass(dark);
    persist(dark);
  }, []);

  React.useLayoutEffect(() => {
    applyClass(isDark);
    persist(isDark);
  }, [isDark]);

  return (
    <ThemeContext.Provider value={{ isDark, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a <ThemeProvider>');
  }
  return ctx;
}

export default ThemeProvider;
