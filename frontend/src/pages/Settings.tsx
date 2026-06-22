import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { Card } from '../components/Card'
import { Spinner } from '../components/Spinner'
import { useToast } from '../components/Toast'
import type { S3Settings } from '../api/types'

export function Settings() {
  const toast = useToast()

  // --- S3 ---
  const [s3, setS3] = useState<S3Settings | null>(null)
  const [secret, setSecret] = useState('')
  const [savingS3, setSavingS3] = useState(false)

  useEffect(() => {
    api.settings.getS3().then(setS3).catch(e => toast.push(e instanceof Error ? e.message : 'Load failed', 'error'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const s3set = <K extends keyof S3Settings>(k: K, v: S3Settings[K]) => setS3(s => s ? { ...s, [k]: v } : s)

  const saveS3 = async () => {
    if (!s3) return
    setSavingS3(true)
    try {
      const r = await api.settings.saveS3({
        endpoint: s3.endpoint, region: s3.region, bucket: s3.bucket,
        key: s3.key, prefix: s3.prefix, ...(secret ? { secret } : {}),
      })
      toast.push(r.enabled ? 'S3 saved — backups can be pushed' : 'S3 saved (disabled: no bucket)', 'success')
      setSecret('')
      api.settings.getS3().then(setS3)
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Save failed', 'error')
    } finally {
      setSavingS3(false)
    }
  }

  // --- account ---
  const [curPass, setCurPass] = useState('')
  const [newPass, setNewPass] = useState('')
  const [email, setEmail] = useState('')
  const [savingAcct, setSavingAcct] = useState(false)

  useEffect(() => {
    api.settings.getAccount().then(a => setEmail(a.email)).catch(() => {})
  }, [])

  const saveAccount = async () => {
    if (!curPass) { toast.push('Enter your current password', 'error'); return }
    setSavingAcct(true)
    try {
      await api.settings.saveAccount(curPass, { email, ...(newPass ? { password: newPass } : {}) })
      toast.push('Account updated', 'success')
      setCurPass(''); setNewPass('')
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Update failed', 'error')
    } finally {
      setSavingAcct(false)
    }
  }

  const lbl = { display: 'block' as const }

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 'var(--space-lg)' }}>Settings</h1>

      <Card style={{ marginBottom: 'var(--space-lg)', maxWidth: 640 }}>
        <h2 style={{ marginTop: 0 }}>S3 Backups</h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 13, marginTop: 0 }}>
          Any S3-compatible provider (AWS, Backblaze B2, Wasabi, MinIO, DigitalOcean Spaces).
          Leave bucket empty to disable the “Push to S3” button.
        </p>
        {!s3 ? <Spinner /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            <label style={lbl}><div className="section-label">Endpoint</div>
              <input className="input" placeholder="https://s3.us-east-1.amazonaws.com" value={s3.endpoint} onChange={e => s3set('endpoint', e.target.value)} /></label>
            <label style={lbl}><div className="section-label">Region</div>
              <input className="input" placeholder="us-east-1" value={s3.region} onChange={e => s3set('region', e.target.value)} /></label>
            <label style={lbl}><div className="section-label">Bucket</div>
              <input className="input" placeholder="my-backups" value={s3.bucket} onChange={e => s3set('bucket', e.target.value)} /></label>
            <label style={lbl}><div className="section-label">Access key ID</div>
              <input className="input" value={s3.key} onChange={e => s3set('key', e.target.value)} /></label>
            <label style={lbl}><div className="section-label">Secret access key {s3.has_secret && <span style={{ color: 'var(--color-success)' }}>(set — leave blank to keep)</span>}</div>
              <input className="input" type="password" placeholder={s3.has_secret ? '••••••••' : ''} value={secret} onChange={e => setSecret(e.target.value)} /></label>
            <label style={lbl}><div className="section-label">Key prefix</div>
              <input className="input" placeholder="wordops-backups/" value={s3.prefix} onChange={e => s3set('prefix', e.target.value)} /></label>
            <button className="btn btn-primary" disabled={savingS3} onClick={saveS3}>{savingS3 ? <Spinner /> : 'Save S3 settings'}</button>
          </div>
        )}
      </Card>

      <Card style={{ maxWidth: 640 }}>
        <h2 style={{ marginTop: 0 }}>Account</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <label style={lbl}><div className="section-label">Email</div>
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
          <label style={lbl}><div className="section-label">New password (blank = unchanged)</div>
            <input className="input" type="password" autoComplete="new-password" value={newPass} onChange={e => setNewPass(e.target.value)} /></label>
          <label style={lbl}><div className="section-label">Current password (required to save)</div>
            <input className="input" type="password" autoComplete="current-password" value={curPass} onChange={e => setCurPass(e.target.value)} /></label>
          <button className="btn btn-primary" disabled={savingAcct} onClick={saveAccount}>{savingAcct ? <Spinner /> : 'Update account'}</button>
        </div>
      </Card>
    </div>
  )
}
