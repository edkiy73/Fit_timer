import { useState } from 'react';
import { getThemePreference, setThemePreference, type ThemePreference } from '../../theme';
export function ThemePicker() {
  const [value, setValue] = useState(getThemePreference);
  return <label className="ft-theme-picker">Тема <select value={value} onChange={event => {
    const next = event.target.value as ThemePreference; setValue(next); setThemePreference(next);
  }}><option value="system">Как на устройстве</option><option value="light">Светлая</option><option value="dark">Тёмная</option></select></label>;
}
