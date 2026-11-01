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
    } else {
      // Default to dark, ensure class is set
      setTheme('dark');
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem(THEME_KEY, next);
      document.documentElement.classList.toggle('dark', next === 'dark');
      return next;
    });
  }, []);

  const setLight = useCallback(() => {
    setTheme('light');
    localStorage.setItem(THEME_KEY, 'light');
    document.documentElement.classList.remove('dark');
  }, []);

  const setDark = useCallback(() => {
    setTheme('dark');
    localStorage.setItem(THEME_KEY, 'dark');
    document.documentElement.classList.add('dark');
  }, []);

  return { theme, toggleTheme, setLight, setDark, mounted };
}