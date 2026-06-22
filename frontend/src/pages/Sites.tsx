import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAsync } from '../hooks/useAsync'
import { Card } from '../components/Card'
import { Modal } from '../components/Modal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { StatusBadge } from '../components/StatusBadge'
import { Spinner } from '../components/Spinner'
import { WorkingText } from '../components/WorkingText'
import { useToast } from '../components/Toast'
import type { CreateSite, Site, SiteInfo, CommandResult } from '../api/types'

// fallback if the php-versions endpoint returns nothing
const PHP_FALLBACK = [{ code: '83', label: '8.3' }]

const EMPTY_CREATE: CreateSite = { domain: '', type: 'wp', php: '83', cache: 'fastcgi', ssl: false }

export function Sites() {
  const navigate = useNavigate()
  const toast = useToast()
  const sites = useAsync(() => api.sites.list(), [], 'sites')
  const phpVersions = useAsync(() => api.system.phpVersions().catch(() => PHP_FALLBACK), [], 'php-versions')
  const phpList = phpVersions.data && phpVersions.data.length ? phpVersions.data : PHP_FALLBACK

  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState<CreateSite>(EMPTY_CREATE)
  const [creating, setCreating] = useState(false)
  const [result, setResult] = useState<CommandResult | null>(null)

  const [info, setInfo] = useState<{ domain: string; data: SiteInfo | null } | null>(null)
  const [delTarget, setDelTarget] = useState<Site | null>(null)
  const [busyRow, setBusyRow] = useState('')
  const [deleting, setDeleting] = useState(false)

  const set = <K extends keyof CreateSite>(k: K, v: CreateSite[K]) => setForm(f => ({ ...f, [k]: v }))

  const create = async () => {
    setCreating(true)
    try {
      // default php to first available if the chosen one isn't installed
      const php = phpList.some(v => v.code === form.php) ? form.php : (phpList[0].code as CreateSite['php'])
      const r = await api.sites.create({ ...form, php })
      if (r.ok) {
        toast.push('Site created', 'success')
        setCreateOpen(false)
        setForm(EMPTY_CREATE)
        setResult(r)            // show output + WP admin credentials once
        sites.reload()
      } else {
        toast.push(r.output || 'Create failed', 'error')
      }
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Create failed', 'error')
    } finally {
      setCreating(false)
    }
  }

  // refresh=false for actions that don't change the site list (e.g. cache purge),
  // so we don't trigger a slow `wo site list` for nothing.
  const action = async (domain: string, fn: () => Promise<unknown>, label: string, refresh = true) => {
    setBusyRow(domain)
    try {
      await fn()
      toast.push(label, 'success')
      if (refresh) sites.reload()
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Action failed', 'error')
    } finally {
      setBusyRow('')
    }
  }

  const openInfo = async (domain: string) => {
    setInfo({ domain, data: null })   // open modal immediately with a loader
    try {
      const data = await api.sites.info(domain)
      setInfo({ domain, data })
    } catch (e) {
      setInfo(null)
      toast.push(e instanceof Error ? e.message : 'Info failed', 'error')
    }
  }

  const doDelete = async () => {
    if (!delTarget) return
    setDeleting(true)
    try {
      await api.sites.remove(delTarget.domain)
      toast.push(`${delTarget.domain} deleted`, 'success')
      setDelTarget(null)
      sites.reload()
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Delete failed', 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
        <h1 className="page-title">Sites</h1>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <button className="btn btn-default" onClick={sites.reload}>Refresh</button>
          <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>Create Site</button>
        </div>
      </div>

      <Card style={{ padding: 0, overflow: 'auto' }}>
        {sites.loading && <div style={{ padding: 'var(--space-lg)' }}><Spinner /></div>}
        {sites.error && <div style={{ padding: 'var(--space-lg)', color: 'var(--color-danger)' }}>{sites.error}</div>}
        {sites.data && (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr style={{ textAlign: 'left', background: 'var(--color-surface-2)' }}>
                {['Domain', 'Type', 'PHP', 'Cache', 'SSL', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: 'var(--space-sm) var(--space-md)', fontSize: 12, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sites.data.map(s => (
                <tr key={s.domain} style={{ borderTop: '1px solid #eee' }}>
                  <td style={{ padding: 'var(--space-sm) var(--space-md)', fontWeight: 700 }}>{s.domain}</td>
                  <td style={{ padding: 'var(--space-sm) var(--space-md)' }}>{s.type || '—'}</td>
                  <td style={{ padding: 'var(--space-sm) var(--space-md)' }}>{s.php || '—'}</td>
                  <td style={{ padding: 'var(--space-sm) var(--space-md)' }}>{s.cache || '—'}</td>
                  <td style={{ padding: 'var(--space-sm) var(--space-md)' }}>{s.ssl ? '🔒' : '—'}</td>
                  <td style={{ padding: 'var(--space-sm) var(--space-md)' }}><StatusBadge status={s.status} /></td>
                  <td style={{ padding: 'var(--space-sm) var(--space-md)' }}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {busyRow === s.domain && <Spinner />}
                      <button className="btn btn-default" style={btnSm} onClick={() => openInfo(s.domain)}>Info</button>
                      <button className="btn btn-default" style={btnSm} onClick={() => action(s.domain, () => api.sites.purgeCache(s.domain), 'Cache purged', false)}>Purge</button>
                      {s.status === 'enabled'
                        ? <button className="btn btn-default" style={btnSm} onClick={() => action(s.domain, () => api.sites.disable(s.domain), 'Disabled')}>Disable</button>
                        : <button className="btn btn-default" style={btnSm} onClick={() => action(s.domain, () => api.sites.enable(s.domain), 'Enabled')}>Enable</button>}
                      <button className="btn btn-default" style={btnSm} onClick={() => navigate(`/backups?domain=${s.domain}`)}>Backups</button>
                      <button className="btn btn-default" style={btnSm} onClick={() => navigate(`/files?path=${s.domain}`)}>Files</button>
                      <button className="btn btn-danger" style={btnSm} onClick={() => setDelTarget(s)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {sites.data.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 'var(--space-lg)', color: 'var(--color-text-muted)' }}>No sites yet.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </Card>

      {/* Create modal */}
      <Modal open={createOpen} title="Create Site" onClose={() => !creating && setCreateOpen(false)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <label>
            <div className="section-label">Domain</div>
            <input className="input" placeholder="example.com" value={form.domain} onChange={e => set('domain', e.target.value)} />
          </label>
          <label>
            <div className="section-label">Type</div>
            <select className="input" value={form.type} onChange={e => set('type', e.target.value as CreateSite['type'])}>
              <option value="wp">WordPress</option>
              <option value="html">HTML</option>
              <option value="php">PHP</option>
              <option value="proxy">Proxy</option>
            </select>
          </label>
          {form.type === 'proxy' && (
            <label>
              <div className="section-label">Proxy target (host:port)</div>
              <input className="input" placeholder="127.0.0.1:8080" value={form.proxyTarget ?? ''} onChange={e => set('proxyTarget', e.target.value)} />
            </label>
          )}
          {form.type !== 'proxy' && (
            <label>
              <div className="section-label">PHP version</div>
              <select className="input" value={form.php} onChange={e => set('php', e.target.value as CreateSite['php'])}>
                {phpList.map(v => <option key={v.code} value={v.code}>{v.label}</option>)}
              </select>
            </label>
          )}
          {form.type === 'wp' && (
            <label>
              <div className="section-label">Cache</div>
              <select className="input" value={form.cache} onChange={e => set('cache', e.target.value as CreateSite['cache'])}>
                <option value="fastcgi">FastCGI</option>
                <option value="redis">Redis</option>
                <option value="none">None</option>
              </select>
            </label>
          )}
          {form.type === 'wp' && (
            <fieldset style={{ border: 'var(--border)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              <legend className="section-label">WP admin (optional — blank = WordOps default)</legend>
              <input className="input" placeholder="username" value={form.wp_user ?? ''} onChange={e => set('wp_user', e.target.value)} />
              <input className="input" placeholder="password" value={form.wp_pass ?? ''} onChange={e => set('wp_pass', e.target.value)} />
              <input className="input" placeholder="email" value={form.wp_email ?? ''} onChange={e => set('wp_email', e.target.value)} />
            </fieldset>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
            <input type="checkbox" checked={form.ssl} onChange={e => set('ssl', e.target.checked)} />
            <span>Let's Encrypt SSL (domain DNS must already resolve here)</span>
          </label>
          <button className="btn btn-primary" disabled={creating || !form.domain} onClick={create}>
            {creating ? <WorkingText /> : 'Create'}
          </button>
        </div>
      </Modal>

      {/* Info modal */}
      <Modal open={!!info} title={info ? `Info — ${info.domain}` : ''} onClose={() => setInfo(null)} width={520}>
        {info && !info.data && <div style={{ padding: 'var(--space-lg)', textAlign: 'center' }}><Spinner /> Loading…</div>}
        {info && info.data && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {Object.entries(info.data).map(([k, v]) => (
                <tr key={k} style={{ borderTop: '1px solid #eee' }}>
                  <td style={{ padding: 'var(--space-xs) var(--space-sm)', fontWeight: 700, whiteSpace: 'nowrap' }}>{k}</td>
                  <td className="mono" style={{ padding: 'var(--space-xs) var(--space-sm)', fontSize: 13 }}>{v}</td>
                </tr>
              ))}
              {Object.keys(info.data).length === 0 && <tr><td style={{ color: 'var(--color-text-muted)' }}>No info returned.</td></tr>}
            </tbody>
          </table>
        )}
      </Modal>

      {/* Create result — shows WP admin credentials + full output once */}
      <Modal open={!!result} title="Site created" onClose={() => setResult(null)} width={620}>
        {result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            {(result.wp_user || result.wp_pass) && (
              <div className="card-2" style={{ padding: 'var(--space-md)' }}>
                <div className="section-label">WordPress admin — copy now, shown once</div>
                {result.wp_user && <div className="mono">user: <strong>{result.wp_user}</strong></div>}
                {result.wp_pass && <div className="mono">pass: <strong>{result.wp_pass}</strong></div>}
              </div>
            )}
            <pre className="mono-surface" style={{ maxHeight: 320, overflow: 'auto', whiteSpace: 'pre-wrap', margin: 0 }}>{result.output}</pre>
          </div>
        )}
      </Modal>

      {/* Delete typed-confirm */}
      <ConfirmDialog
        open={!!delTarget}
        title="Delete Site"
        message={`This permanently deletes ${delTarget?.domain} and all its data via "wo site delete".`}
        confirmPhrase={delTarget?.domain}
        confirmLabel="Delete Site"
        danger
        busy={deleting}
        onConfirm={doDelete}
        onCancel={() => !deleting && setDelTarget(null)}
      />
    </div>
  )
}

const btnSm = { padding: '4px 10px', fontSize: 12 }
