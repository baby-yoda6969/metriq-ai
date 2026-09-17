import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../lib/ThemeContext.jsx';

export function ThemeToggle() {
  const { mode, toggle } = useTheme();
  const label = `Switch to ${mode === 'dark' ? 'light' : 'dark'} theme`;
  return <button type="button" className="website-theme-toggle" onClick={toggle}
    aria-label={label} title={label}>
    {mode === 'dark' ? <Sun size={19} aria-hidden="true" /> : <Moon size={19} aria-hidden="true" />}
  </button>;
}
