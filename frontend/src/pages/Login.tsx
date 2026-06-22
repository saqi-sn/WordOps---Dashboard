import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { auth } from '../auth'
import { Card } from '../components/Card'
import { Spinner } from '../components/Spinner'

export function Login() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // First run? send to setup.
  useEffect(() => {
    api.auth.status().then(s => { if (!s.setup) navigate('/setup', { replace: true }) }).catch(() => {})
  }, [navigate])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const r = await api.auth.login(username, password)
      auth.set(r.token, r.expires_in)
      navigate('/')
    } catch {
      setError('Invalid credentials')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 'var(--space-lg)' }}>
      <Card style={{ width: 360, maxWidth: '100%' }}>
        <h1 className="page-title" style={{ marginBottom: 'var(--space-xs)' }}>WordOps</h1>
        <p className="section-label" style={{ marginBottom: 'var(--space-lg)' }}>admin login</p>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <input
            className="input" placeholder="Username" autoFocus autoComplete="username"
            value={username} onChange={e => setUsername(e.target.value)}
          />
          <input
            className="input" type="password" placeholder="Password" autoComplete="current-password"
            value={password} onChange={e => setPassword(e.target.value)}
          />
          {error && <div style={{ color: 'var(--color-danger)', fontWeight: 700, fontSize: 13 }}>{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? <Spinner /> : 'Log in'}
          </button>
        </form>
      </Card>
    </div>
  )
}
