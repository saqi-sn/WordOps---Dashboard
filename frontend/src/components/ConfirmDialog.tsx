import { useEffect, useState } from 'react'
import { Modal } from './Modal'

interface ConfirmProps {
  open: boolean
  title: string
  message: string
  // When set, user must type this exact string to enable the confirm button.
  confirmPhrase?: string
  confirmLabel?: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

// Confirmation dialog. With confirmPhrase set, becomes a typed-confirm guard
// (site delete, recursive dir delete) — button stays disabled until exact match.
export function ConfirmDialog({
  open, title, message, confirmPhrase, confirmLabel = 'Confirm',
  danger, busy, onConfirm, onCancel,
}: ConfirmProps) {
  const [typed, setTyped] = useState('')
  useEffect(() => { if (open) setTyped('') }, [open])

  const locked = !!confirmPhrase && typed !== confirmPhrase

  return (
    <Modal open={open} title={title} onClose={onCancel}>
      <p style={{ color: 'var(--color-text-muted)', marginTop: 0 }}>{message}</p>
      {confirmPhrase && (
        <>
          <p style={{ fontSize: 13 }}>
            Type <code style={{ fontWeight: 700 }}>{confirmPhrase}</code> to confirm:
          </p>
          <input
            className="input mono"
            value={typed}
            autoFocus
            onChange={e => setTyped(e.target.value)}
            placeholder={confirmPhrase}
            style={{ marginBottom: 'var(--space-md)' }}
          />
        </>
      )}
      <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
        <button className="btn btn-default" onClick={onCancel} disabled={busy}>Cancel</button>
        <button
          className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
          onClick={onConfirm}
          disabled={locked || busy}
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
