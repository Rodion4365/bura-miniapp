import React from 'react'

import type { Suit } from '../types'

type Props = {
  suit: Suit
  size?: number
  className?: string
}

const RED = '#D84C4C'
const BLACK = '#1F1F1F'

type SuitConfig = {
  label: string
  render: (color: string) => React.ReactNode
  color: string
}

const SUIT_CONFIG: Record<Suit, SuitConfig> = {
  '♠': {
    label: 'Пики',
    color: BLACK,
    render: color => (
      <>
        <path
          d="M16 2c-4.6 4.5-12 11-12 16 0 4.3 3.2 7 7 7h1l-2 7h12l-2-7h1c3.8 0 7-2.7 7-7 0-5-7.4-11.5-12-16z"
          fill={color}
        />
        <path d="M12 25h8l-4 7z" fill={color} />
      </>
    ),
  },
  '♣': {
    label: 'Трефы',
    color: BLACK,
    render: color => (
      <>
        <circle cx={16} cy={10} r={6} fill={color} />
        <circle cx={10} cy={18} r={6} fill={color} />
        <circle cx={22} cy={18} r={6} fill={color} />
        <path d="M14 18h4v9h-4z" fill={color} />
        <path d="M12 27h8l-4 5z" fill={color} />
      </>
    ),
  },
  '♥': {
    label: 'Червы',
    color: RED,
    render: color => (
      <path
        d="M16 28s-12-7.6-12-16c0-4.4 3.6-8 8-8 2.8 0 5.3 1.6 6 4 .7-2.4 3.2-4 6-4 4.4 0 8 3.6 8 8 0 8.4-12 16-12 16z"
        fill={color}
      />
    ),
  },
  '♦': {
    label: 'Бубны',
    color: RED,
    render: color => <path d="M16 2 26 16 16 30 6 16z" fill={color} />,
  },
}

export default function SuitIcon({ suit, size = 18, className }: Props) {
  const config = SUIT_CONFIG[suit]
  const composedClassName = ['suit-icon', className].filter(Boolean).join(' ')

  return (
    <svg
      className={composedClassName}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label={config.label}
      focusable="false"
    >
      <title>{config.label}</title>
      {config.render(config.color)}
    </svg>
  )
}
