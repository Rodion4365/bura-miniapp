import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import CardView from '../CardView'

const sampleCard = {
  id: 'c_as',
  suit: '♠' as const,
  rank: 14,
  imageUrl: 'face.png',
  backImageUrl: 'back.png',
}

test('renders face values with accessible alt', () => {
  render(<CardView cardId={sampleCard.id} asset={sampleCard} faceUp />)
  expect(screen.getByRole('img')).toHaveAttribute('alt', 'Т♠')
})

test('renders hidden card label when face down', () => {
  render(<CardView cardId={sampleCard.id} asset={sampleCard} faceUp={false} />)
  expect(screen.getByLabelText('Скрытая карта')).toBeInTheDocument()
})
