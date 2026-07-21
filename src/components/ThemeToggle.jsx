import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { resolveTheme, setTheme } from '../lib/theme';

export default function ThemeToggle({ className = 'icon-button' }) {
  const [theme, setThemeState] = useState(() => resolveTheme());

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setThemeState(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={className}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  );
}
