import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAsync } from '../hooks/useAsync'
import { Card } from '../components/Card'
import { StatusBadge } from '../components/StatusBadge'
import { Spinner } from '../components/Spinner'
import { useToast } from '../components/Toast'
import type { Backup } from '../api/types'

interface RecentBackup extends Backup { domain: string }

export function Dashboard() {
  const toast = useToast()
  const sites = useAsync(() => api.sites.list(), [], 'sites')
  const stack = useAsync(() => api.stack.status(), [], 'stack')
  const disk = useAsync(() => api.system.disk(), [], 'disk')
  const [recent, setRecent] = useState<RecentBackup[]>([])
  const [busySvc, setBusySvc] = useState('')

  // Aggregate the latest backups across all sites (best-effort).
  useEffect(() => {
    if (!sites.data) return
    let cancelled = false
    Promise.all(
      sites.data.map(s =>
        api.backups.list(s.domain)
          .then(bs => bs.map(b => ({ ...b, domain: s.domain })))
          .catch(() => [] as RecentBackup[]),
      ),
    ).then(all => {
      if (cancelled) return
      const merged = all.flat().sort((a, b) => b.created_at - a.created_at).slice(0, 5)
      setRecent(merged)
    })
    return () => { cancelled = true }
  }, [sites.data])

  const services = stack.data?.services ?? []
  const running = services.filter(s => s.status === 'running').length

  const restart = async (name: string) => {
    setBusySvc(name)
    try {
      await api.stack.restart(name.toLowerCase())
      toast.push(`${name} restarted`, 'success')
      stack.reload()
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Restart failed', 'error')
    } finally {
      setBusySvc('')
    }
  }

  const refreshAll = () => { sites.reload(); stack.reload(); disk.reload() }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
        <h1 className="page-title">Dashboard</h1>
        <button className="btn btn-default" onClick={refreshAll}>Refresh</button>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
        <Card>
          <div className="section-label">Total Sites</div>
          <div style={{ fontSize: 32, fontWeight: 700 }}>{sites.loading ? <Spinner size={22} /> : sites.data?.length ?? 0}</div>
        </Card>
        <Card alt>
          <div className="section-label">Stack Running</div>
          <div style={{ fontSize: 32, fontWeight: 700 }}>
            {stack.loading ? <Spinner size={22} /> : `${running}/${services.length}`}
          </div>
        </Card>
        <Card>
          <div className="section-label">Disk Used</div>
          <div style={{ fontSize: 32, fontWeight: 700 }}>
            {disk.loading ? <Spinner size={22} /> : `${disk.data?.percent ?? 0}%`}
          </div>
          <div style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
            {disk.data && `${disk.data.used} / ${disk.data.total}`}
          </div>
        </Card>
      </div>

      {/* Stack services grid */}
      <h2 style={{ fontSize: 18 }}>Services</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
        {stack.error && <Card><span style={{ color: 'var(--color-danger)' }}>{stack.error}</span></Card>}
        {services.map(s => (
          <Card key={s.name}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-sm)' }}>
              <strong>{s.name}</strong>
              <StatusBadge status={s.status} />
            </div>
            <button className="btn btn-default" disabled={busySvc === s.name} onClick={() => restart(s.name)}>
              {busySvc === s.name ? <Spinner /> : 'Restart'}
            </button>
          </Card>
        ))}
        {!stack.loading && !stack.error && services.length === 0 && (
          <Card><span style={{ color: 'var(--color-text-muted)' }}>No services reported.</span></Card>
        )}
      </div>

      {/* Recent backups */}
      <h2 style={{ fontSize: 18 }}>Recent Backups</h2>
      <Card>
        {recent.length === 0
          ? <span style={{ color: 'var(--color-text-muted)' }}>No backups found.</span>
          : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {recent.map((b, i) => (
                  <tr key={i} style={{ borderTop: i ? '1px solid #eee' : undefined }}>
                    <td style={{ padding: 'var(--space-xs) 0', fontWeight: 700 }}>{b.domain}</td>
                    <td className="mono" style={{ fontSize: 13 }}>{b.filename}</td>
                    <td style={{ textAlign: 'right', color: 'var(--color-text-muted)' }}>{b.size_mb} MB</td>
                    <td style={{ textAlign: 'right', color: 'var(--color-text-muted)', fontSize: 13 }}>
                      {new Date(b.created_at * 1000).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </Card>
    </div>
  )
}
