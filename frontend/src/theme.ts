declare global { interface Window { Telegram: any } }

/**
 * Применяет тему:
 * 1) Приоритет: Telegram.WebApp.colorScheme (light|dark)
 * 2) Фолбэк: системная prefers-color-scheme
 * Ставит data-theme на <html> и CSS-переменные из Telegram (если есть)
 */
export function applyThemeOnce() {
  const tg = window.Telegram?.WebApp
  const scheme = tg?.colorScheme as 'light'|'dark'|undefined
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches
  const effective: 'light'|'dark' = scheme ?? (prefersDark ? 'dark' : 'light')
  document.documentElement.setAttribute('data-theme', effective)

  // если Телеграм дал цвета — прокинем их в CSS-переменные
  const themeParams = tg?.themeParams || {}
  for (const [key, val] of Object.entries(themeParams)) {
    if (typeof val === 'string') {
      document.documentElement.style.setProperty(`--tg-${key}`, val)
    }
  }
}

export function watchTelegramTheme() {
  const tg = window.Telegram?.WebApp
  // реакция на смену темы в Телеге
  tg?.onEvent?.('themeChanged', () => applyThemeOnce())
  // реакция на системную тему
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
  mq?.addEventListener?.('change', () => applyThemeOnce())
}
