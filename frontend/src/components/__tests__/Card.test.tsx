import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import CardView from '../CardView'

test('renders face values and suits', () => {
  render(<CardView card={{ suit: '♠', rank: 14 }} />)
  expect(screen.getByTitle('Т♠')).toBeInTheDocument()
})

test('renders number ranks', () => {
  render(<CardView card={{ suit: '♥', rank: 9 }} />)
  expect(screen.getByTitle('9♥')).toBeInTheDocument()
})
