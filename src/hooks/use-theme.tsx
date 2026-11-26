'use client';

import { useState, useEffect, useCallback } from 'react';

type Theme = 'dark' | 'light';

export const THEME_KEY = 'devrann-theme';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(THEME_KEY) as Theme | null;
    if (stored === 'light' || stored === 'dark') {
      setTheme(stored);
      document.documentElement.classList.toggle('dark', stored === 'dark');
      document.documentElement.classList.toggle('light', stored === 'light');
      document.documentElement.style.colorScheme = stored;
    } else {
      // Default to dark, ensure class is set
      setTheme('dark');
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      document.documentElement.style.colorScheme = 'dark';
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem(THEME_KEY, next);
      document.documentElement.classList.toggle('dark', next === 'dark');
      document.documentElement.classList.toggle('light', next === 'light');
      document.documentElement.style.colorScheme = next;
      return next;
    });
  }, []);

  const setLight = useCallback(() => {
    setTheme('light');
    localStorage.setItem(THEME_KEY, 'light');
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
    document.documentElement.style.colorScheme = 'light';
  }, []);

  const setDark = useCallback(() => {
    setTheme('dark');
    localStorage.setItem(THEME_KEY, 'dark');
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
    document.documentElement.style.colorScheme = 'dark';
  }, []);

  return { theme, toggleTheme, setLight, setDark, mounted };
}