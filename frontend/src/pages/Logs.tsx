import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { Card } from '../components/Card'
import { Spinner } from '../components/Spinner'
import { useToast } from '../components/Toast'

const TYPES = [
  { key: 'nginx/error', label: 'nginx-error' },
  { key: 'nginx/access', label: 'nginx-access' },
  { key: 'php', label: 'php' },
  { key: 'mysql', label: 'mysql' },
]
const LINE_OPTS = [50, 100, 200, 500]

export function Logs() {
  const toast = useToast()
  const [type, setType] = useState(TYPES[0].key)
  const [lines, setLines] = useState(200)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [auto, setAuto] = useState(false)
  const pre = useRef<HTMLPreElement>(null)

  const load = () => {
    setLoading(true)
    api.logs.get(type, lines)
      .then(r => setContent(r.content || '(empty)'))
      .catch(e => toast.push(e instanceof Error ? e.message : 'Load failed', 'error'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [type, lines]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh every 10s when enabled.
  useEffect(() => {
    if (!auto) return
    const id = setInterval(load, 10_000)
    return () => clearInterval(id)
  }, [auto, type, lines]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep scrolled to the bottom on update.
  useEffect(() => { if (pre.current) pre.current.scrollTop = pre.current.scrollHeight }, [content])

  const copy = () => {
    navigator.clipboard.writeText(content).then(
      () => toast.push('Copied', 'success'),
      () => toast.push('Copy failed', 'error'),
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)', flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
        <h1 className="page-title">Logs</h1>
        <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="input" style={{ width: 'auto' }} value={type} onChange={e => setType(e.target.value)}>
            {TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <select className="input" style={{ width: 'auto' }} value={lines} onChange={e => setLines(Number(e.target.value))}>
            {LINE_OPTS.map(n => <option key={n} value={n}>{n} lines</option>)}
          </select>
          <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 13, fontWeight: 700 }}>
            <input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} /> Auto 10s
          </label>
          <button className="btn btn-default" onClick={load}>{loading ? <Spinner /> : 'Refresh'}</button>
          <button className="btn btn-default" onClick={copy}>Copy all</button>
        </div>
      </div>

      <Card style={{ padding: 0, border: 'none', boxShadow: 'none' }}>
        <pre ref={pre} className="mono-surface" style={{ margin: 0, minHeight: 480, maxHeight: '70vh' }}>
          {content}
        </pre>
      </Card>
    </div>
  )
}
