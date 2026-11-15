import { useState } from 'react'
import { MoonIcon, SunIcon } from './Icons'

type Theme = 'light' | 'dark'

// index.html already set data-theme before first paint; read it back as the initial state.
const current = (): Theme =>
  document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(current)

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try { localStorage.setItem('ih.theme', next) } catch { /* not persisted */ }
    setTheme(next)
  }

  return (
    <button className="icon-btn" onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      title={theme === 'dark' ? 'Light theme' : 'Dark theme'}>
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}
