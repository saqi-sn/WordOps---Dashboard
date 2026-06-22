import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { auth } from '../auth'
import { api } from '../api/client'

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/sites', label: 'Sites' },
  { to: '/backups', label: 'Backups' },
  { to: '/files', label: 'Files' },
  { to: '/stack', label: 'Stack' },
  { to: '/logs', label: 'Logs' },
  { to: '/settings', label: 'Settings' },
]

export function Layout() {
  const navigate = useNavigate()
  const [user, setUser] = useState('admin')

  useEffect(() => {
    api.auth.me().then(r => setUser(r.user)).catch(() => {})
  }, [])

  const logout = () => {
    auth.clear()
    navigate('/login')
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside style={{
        width: 220, flexShrink: 0, background: 'var(--color-surface-2)',
        borderRight: 'var(--border)', padding: 'var(--space-lg) 0',
        position: 'sticky', top: 0, height: '100vh',
      }}>
        <div style={{ padding: '0 var(--space-lg)', marginBottom: 'var(--space-xl)' }}>
          <h1 style={{ fontSize: 20, margin: 0 }}>WordOps</h1>
          <div className="section-label">admin panel</div>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column' }}>
          {NAV.map(n => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              style={({ isActive }) => ({
                padding: 'var(--space-sm) var(--space-lg)',
                fontWeight: 700,
                textDecoration: 'none',
                color: 'var(--color-text)',
                borderLeft: isActive ? '4px solid var(--color-primary)' : '4px solid transparent',
                background: isActive ? 'var(--color-surface)' : 'transparent',
              })}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main column */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header style={{
          display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 'var(--space-md)',
          padding: 'var(--space-md) var(--space-lg)', borderBottom: 'var(--border)',
          background: 'var(--color-surface)',
        }}>
          <span style={{ fontWeight: 700 }}>👤 {user}</span>
          <button className="btn btn-default" onClick={logout}>Logout</button>
        </header>
        <main style={{ padding: 'var(--space-lg)', flex: 1 }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
