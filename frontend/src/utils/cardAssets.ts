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
 * Предзагружает все изображения карт
 * Возвращает Promise, который резолвится когда все карты загружены
 * @param onProgress - callback для отслеживания прогресса (loaded, total)
 */
export function preloadAllCards(onProgress?: (loaded: number, total: number) => void): Promise<void> {
  console.log(`[CardAssets] Starting preload of ${ALL_CARD_IMAGES.length} card images`)

  let loadedCount = 0
  const total = ALL_CARD_IMAGES.length

  const promises = ALL_CARD_IMAGES.map((url, index) => {
    return new Promise<void>((resolve, reject) => {
      const img = new Image()

      img.onload = () => {
        loadedCount++
        console.log(`[CardAssets] Loaded ${loadedCount}/${total}: ${url}`)
        onProgress?.(loadedCount, total)
        resolve()
      }

      img.onerror = () => {
        console.error(`[CardAssets] FAILED to load image ${index + 1}/${total}: ${url}`)
        // Не продолжаем если карта не загрузилась - это критическая ошибка
        reject(new Error(`Failed to load card image: ${url}`))
      }

      img.src = url
    })
  })

  return Promise.all(promises).then(() => {
    console.log(`[CardAssets] ✓ All ${ALL_CARD_IMAGES.length} card images preloaded successfully`)
  })
}
