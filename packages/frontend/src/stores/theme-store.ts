import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'system',
      setMode: (mode) => set({ mode }),
    }),
    { name: 'image-crawler-theme' },
  ),
);

function getSystemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * 将 light/dark/system 解析为实际是否使用深色。
 */
export function useIsDarkMode(): boolean {
  const mode = useThemeStore((state) => state.mode);
  const [systemDark, setSystemDark] = useState(getSystemPrefersDark);

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener('change', handler);
    return () => query.removeEventListener('change', handler);
  }, []);

  if (mode === 'system') return systemDark;
  return mode === 'dark';
}
