import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAsync } from '../hooks/useAsync'
import { Card } from '../components/Card'
import { StatusBadge } from '../components/StatusBadge'
import { Spinner } from '../components/Spinner'
import { useToast } from '../components/Toast'

type Act = 'start' | 'stop' | 'restart'

export function Stack() {
  const toast = useToast()
  const stack = useAsync(() => api.stack.status(), [])
  const [busy, setBusy] = useState('')

  // Auto-refresh every 30s.
  useEffect(() => {
    const id = setInterval(() => stack.reload(), 30_000)
    return () => clearInterval(id)
  }, [stack.reload])

  const services = stack.data?.services ?? []

  const act = async (name: string, a: Act) => {
    setBusy(name + a)
    const svc = name.toLowerCase()
    try {
      await api.stack[a](svc)
      toast.push(`${name} ${a}ed`, 'success')
      stack.reload()
    } catch (e) {
      toast.push(e instanceof Error ? e.message : `${a} failed`, 'error')
    } finally {
      setBusy('')
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
        <h1 className="page-title">Stack</h1>
        <button className="btn btn-default" onClick={stack.reload}>Refresh</button>
      </div>

      {stack.error && <Card><span style={{ color: 'var(--color-danger)' }}>{stack.error}</span></Card>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-md)' }}>
        {services.map(s => {
          const rowBusy = busy.startsWith(s.name)
          return (
            <Card key={s.name}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
                <strong style={{ fontSize: 16 }}>{s.name}</strong>
                <StatusBadge status={s.status} />
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
                {rowBusy && <Spinner />}
                <button className="btn btn-primary" style={btnSm} disabled={rowBusy} onClick={() => act(s.name, 'start')}>Start</button>
                <button className="btn btn-danger" style={btnSm} disabled={rowBusy} onClick={() => act(s.name, 'stop')}>Stop</button>
                <button className="btn btn-default" style={btnSm} disabled={rowBusy} onClick={() => act(s.name, 'restart')}>Restart</button>
              </div>
            </Card>
          )
        })}
        {stack.loading && services.length === 0 && <Card><Spinner /></Card>}
        {!stack.loading && services.length === 0 && !stack.error && (
          <Card><span style={{ color: 'var(--color-text-muted)' }}>No services reported.</span></Card>
        )}
      </div>
    </div>
  )
}

const btnSm = { padding: '6px 12px', fontSize: 12 }
