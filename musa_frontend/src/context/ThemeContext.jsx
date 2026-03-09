import { createContext, useContext, useState, useEffect, useRef } from 'react';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const overrideRef = useRef(null);

  useEffect(() => {
    // If there's an active override (e.g. tienda forces dark), apply that instead
    const effective = overrideRef.current ?? theme;
    document.documentElement.setAttribute('data-theme', effective);
    if (!overrideRef.current) localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');

  // Force a specific theme (returns cleanup function to restore previous)
  const forceTheme = (forcedTheme) => {
    overrideRef.current = forcedTheme;
    document.documentElement.setAttribute('data-theme', forcedTheme);
    return () => {
      overrideRef.current = null;
      const saved = localStorage.getItem('theme') || 'light';
      document.documentElement.setAttribute('data-theme', saved);
    };
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, forceTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
