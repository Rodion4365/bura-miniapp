declare global { interface Window { Telegram: any } }

function normalizeHex(input?: string | null): string | null {
  if (!input) return null
  let value = input.trim()
  if (!value) return null
  if (value.startsWith('var(')) return null
  if (value.startsWith('#')) value = value.slice(1)
  if (value.length === 3) {
    value = value
      .split('')
      .map(ch => ch + ch)
      .join('')
  }
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return null
  return `#${value.toLowerCase()}`
}

function hexChannel(hex: string, offset: number): number {
  return parseInt(hex.slice(offset, offset + 2), 16)
}

function relativeLuminance(hex: string): number {
  const r = hexChannel(hex, 1)
  const g = hexChannel(hex, 3)
  const b = hexChannel(hex, 5)
  const toLinear = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const lr = toLinear(r)
  const lg = toLinear(g)
  const lb = toLinear(b)
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb
}

function mixHex(a: string, b: string, weight: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  const inv = 1 - weight
  const r = clamp(hexChannel(a, 1) * inv + hexChannel(b, 1) * weight)
  const g = clamp(hexChannel(a, 3) * inv + hexChannel(b, 3) * weight)
  const bl = clamp(hexChannel(a, 5) * inv + hexChannel(b, 5) * weight)
  const toHex = (v: number) => v.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`
}

function applyContrast(themeParams: Record<string, unknown>, scheme: 'light' | 'dark') {
  const root = document.documentElement.style
  const bgCandidate =
    normalizeHex(themeParams['bg_color'] as string) || normalizeHex(themeParams['secondary_bg_color'] as string)
  const fgCandidate = normalizeHex(themeParams['text_color'] as string)

  const bg = bgCandidate || (scheme === 'dark' ? '#0f1115' : '#ffffff')
  const fg =
    fgCandidate ||
    (() => {
      const lum = relativeLuminance(bg)
      return lum > 0.5 ? '#111111' : '#f3f3f3'
    })()

  root.setProperty('--bg', bg)
  root.setProperty('--fg', fg)

  const cardMix = scheme === 'dark' ? 0.14 : 0.08
  const borderMix = scheme === 'dark' ? 0.28 : 0.18
  const mutedMix = scheme === 'dark' ? 0.45 : 0.65

  root.setProperty('--card', mixHex(bg, fg, cardMix))
  root.setProperty('--border', mixHex(bg, fg, borderMix))
  root.setProperty('--muted', mixHex(fg, bg, mutedMix))
  root.setProperty('--primary', fg)
  root.setProperty('--primary-fg', bg)
}

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

  applyContrast(themeParams, effective)
}

export function watchTelegramTheme(): (() => void) | undefined {
  const tg = window.Telegram?.WebApp
  const handler = () => applyThemeOnce()

  // реакция на смену темы в Телеге
  tg?.onEvent?.('themeChanged', handler)

  // реакция на системную тему
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
  mq?.addEventListener?.('change', handler)

  // Возвращаем cleanup функцию
  return () => {
    tg?.offEvent?.('themeChanged', handler)
    mq?.removeEventListener?.('change', handler)
  }
}
