import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useBossTheme } from '../../theme/ThemeContext';

/** A single, accessible, persistent appearance control for office and ambassador accounts. */
export const ThemeToggle: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { theme, toggleTheme } = useBossTheme();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`boss-theme-toggle ${compact ? 'boss-theme-toggle--compact' : ''}`}
      aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`}
      title={`Appearance: ${dark ? 'Dark' : 'Light'} (switch to ${dark ? 'Light' : 'Dark'})`}
      aria-pressed={dark}
    >
      {dark ? <Moon size={17} aria-hidden="true" /> : <Sun size={17} aria-hidden="true" />}
      <span>{dark ? 'Dark' : 'Light'}</span>
    </button>
  );
};
