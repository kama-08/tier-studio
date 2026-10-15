import { Monitor, Moon, Sun } from 'lucide-react';
import { useThemeStore, type ThemePreference } from '@/app/theme';
import { Button } from './button';

export function ThemeToggle() {
  const theme = useThemeStore((state) => state.theme);
  const setPreference = useThemeStore((state) => state.setPreference);
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      onClick={() => setPreference(next)}
    >
      {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
    </Button>
  );
}

const options = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
] satisfies { value: ThemePreference; label: string; Icon: typeof Sun }[];

export function ThemeOptions() {
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);
  return (
    <fieldset className="theme-options">
      <legend className="field-label">Color theme</legend>
      <div className="theme-option-grid">
        {options.map(({ value, label, Icon }) => (
          <label className="theme-option" key={value}>
            <input
              type="radio"
              name="color-theme"
              value={value}
              checked={preference === value}
              onChange={() => setPreference(value)}
            />
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
