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
 */
export function preloadAllCards(): Promise<void> {
  console.log(`[CardAssets] Starting preload of ${ALL_CARD_IMAGES.length} card images`)

  const promises = ALL_CARD_IMAGES.map(url => {
    return new Promise<void>((resolve) => {
      const img = new Image()
      img.onload = () => {
        resolve()
      }
      img.onerror = () => {
        console.warn(`[CardAssets] Failed to load: ${url}`)
        resolve() // Продолжаем даже если одна карта не загрузилась
      }
      img.src = url
    })
  })

  return Promise.all(promises).then(() => {
    console.log(`[CardAssets] All ${ALL_CARD_IMAGES.length} card images preloaded successfully`)
  })
}
