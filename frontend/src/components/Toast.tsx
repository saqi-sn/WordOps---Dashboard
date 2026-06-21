import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type ToastKind = 'success' | 'error' | 'info'
interface ToastItem { id: number; msg: string; kind: ToastKind }

interface ToastCtx { push: (msg: string, kind?: ToastKind) => void }
const Ctx = createContext<ToastCtx>({ push: () => {} })

export function useToast() { return useContext(Ctx) }

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const push = useCallback((msg: string, kind: ToastKind = 'info') => {
    const id = nextId++
    setItems(prev => [...prev, { id, msg, kind }])
    setTimeout(() => setItems(prev => prev.filter(t => t.id !== id)), 4000)
  }, [])

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div style={{
        position: 'fixed', top: 'var(--space-lg)', right: 'var(--space-lg)',
        display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)', zIndex: 1000,
      }}>
        {items.map(t => (
          <div key={t.id} className="card" style={{
            padding: 'var(--space-sm) var(--space-md)',
            background: t.kind === 'error' ? 'var(--color-danger)'
              : t.kind === 'success' ? 'var(--color-primary)' : 'var(--color-surface)',
            color: t.kind === 'info' ? 'var(--color-text)' : 'white',
            fontWeight: 700, maxWidth: 360,
          }}>
            {t.msg}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
