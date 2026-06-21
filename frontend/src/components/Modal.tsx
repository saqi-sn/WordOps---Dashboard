import type { ReactNode } from 'react'

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  width?: number
}

// Backdrop + centered card. Click backdrop or Esc-area to close.
export function Modal({ open, title, onClose, children, width = 440 }: ModalProps) {
  if (!open) return null
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(44,44,44,0.45)',
        display: 'grid', placeItems: 'center', zIndex: 900, padding: 'var(--space-md)',
      }}
    >
      <div
        className="card"
        onClick={e => e.stopPropagation()}
        style={{ width, maxWidth: '100%', maxHeight: '90vh', overflow: 'auto' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
          <button className="btn btn-default" style={{ padding: '2px 10px' }} onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
