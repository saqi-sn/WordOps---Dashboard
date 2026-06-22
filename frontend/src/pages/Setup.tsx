import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { auth } from '../auth'
import { Card } from '../components/Card'
import { Spinner } from '../components/Spinner'

export function Setup() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // If already set up, this page shouldn't show — bounce to login.
  useEffect(() => {
    api.auth.status().then(s => { if (s.setup) navigate('/login', { replace: true }) }).catch(() => {})
  }, [navigate])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) return setError('Password must be at least 8 characters')
    if (password !== confirm) return setError('Passwords do not match')
    setBusy(true)
    try {
      const r = await api.auth.setup(username, password, email)
      auth.set(r.token, r.expires_in)
      navigate('/')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Setup failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 'var(--space-lg)' }}>
      <Card style={{ width: 380, maxWidth: '100%' }}>
        <h1 className="page-title" style={{ marginBottom: 'var(--space-xs)' }}>Welcome</h1>
        <p className="section-label" style={{ marginBottom: 'var(--space-lg)' }}>create your admin account</p>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <input className="input" placeholder="Username" autoFocus autoComplete="username"
            value={username} onChange={e => setUsername(e.target.value)} />
          <input className="input" type="password" placeholder="Password (min 8 chars)" autoComplete="new-password"
            value={password} onChange={e => setPassword(e.target.value)} />
          <input className="input" type="password" placeholder="Confirm password" autoComplete="new-password"
            value={confirm} onChange={e => setConfirm(e.target.value)} />
          <input className="input" type="email" placeholder="Email (optional)" autoComplete="email"
            value={email} onChange={e => setEmail(e.target.value)} />
          {error && <div style={{ color: 'var(--color-danger)', fontWeight: 700, fontSize: 13 }}>{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? <Spinner /> : 'Create account'}
          </button>
        </form>
      </Card>
    </div>
  )
}
