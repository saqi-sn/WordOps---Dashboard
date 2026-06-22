import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { useAsync } from '../hooks/useAsync'
import { Card } from '../components/Card'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Spinner } from '../components/Spinner'
import { WorkingText } from '../components/WorkingText'
import { useToast } from '../components/Toast'
import type { Backup } from '../api/types'

const BACKUP_MSGS = ['Dumping database…', 'Archiving files…', 'Compressing…', 'Almost there…']

export function Backups() {
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const sites = useAsync(() => api.sites.list(), [], 'sites')
  const [domain, setDomain] = useState(params.get('domain') ?? '')

  const [backups, setBackups] = useState<Backup[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [busyFile, setBusyFile] = useState('')
  const [delTarget, setDelTarget] = useState<Backup | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [offerLocal, setOfferLocal] = useState<string | null>(null)

  // Default the selector to the first site once the list loads.
  useEffect(() => {
    if (!domain && sites.data && sites.data.length) setDomain(sites.data[0].domain)
  }, [sites.data, domain])

  const load = (d: string) => {
    if (!d) return
    setLoading(true)
    api.backups.list(d)
      .then(setBackups)
      .catch(e => toast.push(e instanceof Error ? e.message : 'Load failed', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { if (domain) load(domain) /* eslint-disable-next-line */ }, [domain])

  const selectDomain = (d: string) => {
    setDomain(d)
    setParams(d ? { domain: d } : {})
  }

  const createBackup = async (kind: 'db' | 'files') => {
    setCreating(true)
    try {
      const r = await api.backups.create(domain, kind)
      if (r.ok) { toast.push(`${kind === 'db' ? 'Database' : 'Files'} backup created`, 'success'); load(domain) }
      else toast.push(r.error || r.output || 'Backup failed', 'error')
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Backup failed', 'error')
    } finally {
      setCreating(false)
    }
  }

  const download = async (f: string) => {
    setBusyFile(f)
    try { await api.backups.download(domain, f) }
    catch (e) { toast.push(e instanceof Error ? e.message : 'Download failed', 'error') }
    finally { setBusyFile('') }
  }

  const pushS3 = async (f: string) => {
    setBusyFile(f)
    try {
      const r = await api.backups.pushS3(domain, f)
      if (r.ok) { toast.push('Pushed to S3', 'success'); load(domain); setOfferLocal(f) }
      else toast.push(r.error || 'S3 push failed', 'error')
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'S3 push failed', 'error')
    } finally {
      setBusyFile('')
    }
  }

  const removeS3 = async (f: string) => {
    setBusyFile(f)
    try {
      const r = await api.backups.deleteS3(domain, f)
      if (r.ok) { toast.push('Removed from S3', 'success'); load(domain) }
      else toast.push(r.error || 'S3 delete failed', 'error')
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'S3 delete failed', 'error')
    } finally {
      setBusyFile('')
    }
  }

  const deleteLocalNow = async () => {
    const f = offerLocal
    setOfferLocal(null)
    if (!f) return
    try {
      await api.backups.delete(domain, f)
      toast.push('Local copy deleted', 'success')
      load(domain)
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Delete failed', 'error')
    }
  }

  const doDelete = async () => {
    if (!delTarget) return
    setDeleting(true)
    try {
      await api.backups.delete(domain, delTarget.filename)
      toast.push('Backup deleted', 'success')
      setDelTarget(null)
      load(domain)
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Delete failed', 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
        <h1 className="page-title">Backups</h1>
        <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
          <select className="input" style={{ width: 'auto' }} value={domain} onChange={e => selectDomain(e.target.value)}>
            <option value="">Select site…</option>
            {sites.data?.map(s => <option key={s.domain} value={s.domain}>{s.domain}</option>)}
          </select>
          <button className="btn btn-default" disabled={!domain} onClick={() => load(domain)}>Refresh</button>
          {creating
            ? <span className="btn btn-default" style={{ pointerEvents: 'none' }}><WorkingText messages={BACKUP_MSGS} /></span>
            : <>
                <button className="btn btn-primary" disabled={!domain} onClick={() => createBackup('db')}>Backup Database</button>
                <button className="btn btn-primary" disabled={!domain} onClick={() => createBackup('files')}>Backup Files</button>
              </>}
        </div>
      </div>

      <Card style={{ padding: 0, overflow: 'auto' }}>
        {loading && <div style={{ padding: 'var(--space-lg)' }}><Spinner /></div>}
        {!loading && !domain && <div style={{ padding: 'var(--space-lg)', color: 'var(--color-text-muted)' }}>Pick a site to view backups.</div>}
        {!loading && domain && (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
            <thead>
              <tr style={{ textAlign: 'left', background: 'var(--color-surface-2)' }}>
                {['Filename', 'Type', 'Size', 'Date', 'In S3', 'Actions'].map(h => (
                  <th key={h} style={{ padding: 'var(--space-sm) var(--space-md)', fontSize: 12, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {backups.map(b => (
                <tr key={b.filename} style={{ borderTop: '1px solid #eee' }}>
                  <td className="mono" style={{ padding: 'var(--space-sm) var(--space-md)', fontSize: 13 }}>{b.filename}</td>
                  <td style={{ padding: 'var(--space-sm) var(--space-md)' }}>{b.kind === 'database' ? 'DB' : b.kind === 'files' ? 'Files' : '—'}</td>
                  <td style={{ padding: 'var(--space-sm) var(--space-md)' }}>{b.local ? `${b.size_mb} MB` : <span style={{ color: 'var(--color-text-muted)' }}>S3 only</span>}</td>
                  <td style={{ padding: 'var(--space-sm) var(--space-md)', color: 'var(--color-text-muted)', fontSize: 13 }}>
                    {b.created_at ? new Date(b.created_at * 1000).toLocaleString() : '—'}
                  </td>
                  <td style={{ padding: 'var(--space-sm) var(--space-md)' }}>{b.in_s3 ? '✓' : '—'}</td>
                  <td style={{ padding: 'var(--space-sm) var(--space-md)' }}>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      {busyFile === b.filename && <Spinner />}
                      <button className="btn btn-default" style={btnSm} disabled={!b.local} onClick={() => download(b.filename)}>Download</button>
                      {b.in_s3
                        ? <button className="btn btn-default" style={btnSm} onClick={() => removeS3(b.filename)}>Delete from S3</button>
                        : <button className="btn btn-default" style={btnSm} onClick={() => pushS3(b.filename)}>Push to S3</button>}
                      <button className="btn btn-danger" style={btnSm} disabled={!b.local} onClick={() => setDelTarget(b)}>Delete local</button>
                    </div>
                  </td>
                </tr>
              ))}
              {backups.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 'var(--space-lg)', color: 'var(--color-text-muted)' }}>No backups for this site.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </Card>

      <ConfirmDialog
        open={!!delTarget}
        title="Delete Backup"
        message={`Delete ${delTarget?.filename}? This removes the local file (S3 copy, if any, is kept).`}
        confirmLabel="Delete"
        danger
        busy={deleting}
        onConfirm={doDelete}
        onCancel={() => !deleting && setDelTarget(null)}
      />

      <ConfirmDialog
        open={!!offerLocal}
        title="Delete local copy?"
        message={`${offerLocal} is now stored in S3. Delete the local copy to free disk space? (You can re-download it from S3 later.)`}
        confirmLabel="Delete local"
        onConfirm={deleteLocalNow}
        onCancel={() => setOfferLocal(null)}
      />
    </div>
  )
}

const btnSm = { padding: '4px 10px', fontSize: 12 }
