declare global {
  interface Window {
    Telegram?: any
  }
}

type Numeric = number | undefined | null

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function resolveNumber(value: Numeric, fallback: number): number {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : undefined
  return num ?? fallback
}

/**
 * Updates CSS custom properties related to viewport sizing and adaptive scale.
 * Используем данные Telegram WebApp API (если доступны) и window.
 */
function applyViewportVars() {
  const tg = window.Telegram?.WebApp
  const width = resolveNumber(tg?.viewportWidth, window.innerWidth)
  const height = resolveNumber(tg?.viewportHeight, window.innerHeight)
  const stableHeight = resolveNumber(tg?.viewportStableHeight, height)

  const docStyle = document.documentElement.style
  docStyle.setProperty('--app-vw', `${Math.round(width)}px`)
  docStyle.setProperty('--app-vh', `${Math.round(height)}px`)
  docStyle.setProperty('--app-vh-stable', `${Math.round(stableHeight)}px`)

  // Рассчитываем коэффициент масштабирования интерфейса.
  const clampedWidth = clamp(width, 320, 1024)
  const scale = clamp(0.9 + ((clampedWidth - 320) / (1024 - 320)) * 0.4, 0.9, 1.3)
  docStyle.setProperty('--app-scale', scale.toFixed(3))

  const baseFont = clamp(14 + ((clampedWidth - 320) / (768 - 320)) * 4, 14, 18)
  docStyle.setProperty('--app-base-font', `${baseFont.toFixed(2)}px`)
}

/**
 * Настраивает реакцию на изменение размеров вьюпорта Telegram/браузера.
 */
export function initViewportSizing() {
  applyViewportVars()

  const resizeHandler = () => applyViewportVars()
  window.addEventListener('resize', resizeHandler)

  const vv = window.visualViewport
  vv?.addEventListener('resize', resizeHandler)

  const tg = window.Telegram?.WebApp
  const handleTelegramViewport = () => applyViewportVars()
  tg?.onEvent?.('viewportChanged', handleTelegramViewport)

  return () => {
    window.removeEventListener('resize', resizeHandler)
    vv?.removeEventListener('resize', resizeHandler)
    tg?.offEvent?.('viewportChanged', handleTelegramViewport)
  }
}

