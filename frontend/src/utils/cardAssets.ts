// Предгенерированный список всех карт для предзагрузки
// 36 карт: 4 масти × 9 рангов (6,7,8,9,10,J,Q,K,A)

const SUITS = ['S', 'H', 'D', 'C'] // Spades, Hearts, Diamonds, Clubs
const RANKS = ['6', '7', '8', '9', '0', 'J', 'Q', 'K', 'A'] // 0 = 10

const BASE_URL = 'https://deckofcardsapi.com/static/img'
const BACK_IMAGE = `${BASE_URL}/back.png`

// Генерируем список всех 36 карт + рубашка
export const ALL_CARD_IMAGES: string[] = [
  BACK_IMAGE,
  ...SUITS.flatMap(suit =>
    RANKS.map(rank => `${BASE_URL}/${rank}${suit}.png`)
  )
]

/**
 * Предзагружает одно изображение с таймаутом
 */
function preloadImage(url: string, timeoutMs: number = 3000): Promise<{ url: string; success: boolean }> {
  return new Promise((resolve) => {
    const img = new Image()
    let settled = false

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true
        console.warn(`[CardAssets] Timeout loading: ${url}`)
        resolve({ url, success: false })
      }
    }, timeoutMs)

    img.onload = () => {
      if (!settled) {
        settled = true
        clearTimeout(timeout)
        resolve({ url, success: true })
      }
    }

    img.onerror = () => {
      if (!settled) {
        settled = true
        clearTimeout(timeout)
        console.warn(`[CardAssets] Failed to load: ${url}`)
        resolve({ url, success: false })
      }
    }

    // Начинаем загрузку
    img.src = url
  })
}

/**
 * Предзагружает все изображения карт
 * Возвращает Promise, который резолвится когда все карты загружены (или таймаут)
 * НЕ блокирует приложение при ошибке - карты будут подгружаться по необходимости
 * @param onProgress - callback для отслеживания прогресса (loaded, total)
 */
export function preloadAllCards(onProgress?: (loaded: number, total: number) => void): Promise<void> {
  const total = ALL_CARD_IMAGES.length
  console.log(`[CardAssets] Starting preload of ${total} card images`)

  let loadedCount = 0

  // Загружаем все карты параллельно с коротким таймаутом 3 секунды
  const promises = ALL_CARD_IMAGES.map((url) =>
    preloadImage(url, 3000).then(result => {
      loadedCount++
      if (result.success) {
        console.log(`[CardAssets] ✓ ${loadedCount}/${total}`)
      } else {
        console.warn(`[CardAssets] ✗ ${loadedCount}/${total}`)
      }
      onProgress?.(loadedCount, total)
      return result
    })
  )

  return Promise.all(promises).then((results) => {
    const succeeded = results.filter(r => r.success)
    const failed = results.filter(r => !r.success)

    console.log(`[CardAssets] Preload complete: ${succeeded.length}/${total} loaded successfully`)

    if (failed.length > 0) {
      console.warn(`[CardAssets] ${failed.length} images failed to preload - they will load on demand`)
      // НЕ выбрасываем ошибку - позволяем приложению работать
      // Карты будут подгружаться по мере необходимости и кэшироваться браузером
    }
  })
}
