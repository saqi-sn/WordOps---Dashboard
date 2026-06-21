import type { CSSProperties, ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  alt?: boolean          // pink-tint variant
  className?: string
  style?: CSSProperties
}

export function Card({ children, alt, className = '', style }: CardProps) {
  return (
    <div className={`card ${alt ? 'card-2' : ''} ${className}`.trim()} style={style}>
      {children}
    </div>
  )
}
