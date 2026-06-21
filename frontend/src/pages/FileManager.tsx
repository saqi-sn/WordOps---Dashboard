import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { Card } from '../components/Card'
import { Modal } from '../components/Modal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Spinner } from '../components/Spinner'
import { useToast } from '../components/Toast'
import type { FileEntry } from '../api/types'

const PHP_EXT = /\.(php|php[3457]|phtml|phar|cgi|pl)$/i

function join(base: string, name: string) {
  return base ? `${base}/${name}` : name
}
function parent(path: string) {
  const i = path.lastIndexOf('/')
  return i < 0 ? '' : path.slice(0, i)
}

export function FileManager() {
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const path = params.get('path') ?? ''
  const setPath = (p: string) => setParams(p ? { path: p } : {})

  const [entries, setEntries] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(true)
  const fileInput = useRef<HTMLInputElement>(null)

  // editor state
  const [editor, setEditor] = useState<{ path: string; content: string; allowPhp: boolean } | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  // mkdir / rename
  const [mkdirOpen, setMkdirOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [renameTarget, setRenameTarget] = useState<FileEntry | null>(null)
  const [renameTo, setRenameTo] = useState('')
  // delete
  const [delTarget, setDelTarget] = useState<FileEntry | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [uploading, setUploading] = useState(false)

  const load = () => {
    setLoading(true)
    api.files.list(path)
      .then(setEntries)
      .catch(e => toast.push(e instanceof Error ? e.message : 'List failed', 'error'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [path]) // eslint-disable-line react-hooks/exhaustive-deps

  const openEdit = async (e: FileEntry) => {
    const rel = join(path, e.name)
    try {
      const r = await api.files.read(rel)
      setEditor({ path: rel, content: r.content, allowPhp: PHP_EXT.test(e.name) })
    } catch (err) {
      if (err instanceof ApiError && err.status === 415) toast.push('Binary file — not editable', 'error')
      else if (err instanceof ApiError && err.status === 413) toast.push('Too large to edit', 'error')
      else toast.push(err instanceof Error ? err.message : 'Read failed', 'error')
    }
  }

  const saveEdit = async () => {
    if (!editor) return
    setSavingEdit(true)
    try {
      const r = await api.files.write(editor.path, editor.content, editor.allowPhp)
      if (r.ok) { toast.push('Saved', 'success'); setEditor(null); load() }
      else toast.push(r.error || 'Save failed', 'error')
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Save failed', 'error')
    } finally {
      setSavingEdit(false)
    }
  }

  const download = (e: FileEntry) =>
    api.files.download(join(path, e.name), e.name)
      .catch(err => toast.push(err instanceof Error ? err.message : 'Download failed', 'error'))

  const doMkdir = async () => {
    if (!newName) return
    try {
      const r = await api.files.mkdir(join(path, newName))
      if (r.ok) { toast.push('Folder created', 'success'); setMkdirOpen(false); setNewName(''); load() }
      else toast.push(r.error || 'mkdir failed', 'error')
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'mkdir failed', 'error')
    }
  }

  const doRename = async () => {
    if (!renameTarget || !renameTo) return
    try {
      const r = await api.files.rename(join(path, renameTarget.name), join(path, renameTo))
      if (r.ok) { toast.push('Renamed', 'success'); setRenameTarget(null); load() }
      else toast.push(r.error || 'Rename failed', 'error')
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Rename failed', 'error')
    }
  }

  const doDelete = async () => {
    if (!delTarget) return
    setDeleting(true)
    try {
      await api.files.delete(join(path, delTarget.name), delTarget.type === 'dir')
      toast.push('Deleted', 'success')
      setDelTarget(null)
      load()
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Delete failed', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const onUpload = async (file: File) => {
    setUploading(true)
    try {
      const allowPhp = PHP_EXT.test(file.name)
      const r = await api.files.upload(path, file, allowPhp)
      if (r.ok) { toast.push(`Uploaded ${r.output ?? file.name}`, 'success'); load() }
      else toast.push(r.error || 'Upload failed', 'error')
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Upload failed', 'error')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  // Breadcrumb segments
  const segs = path ? path.split('/') : []

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)', flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
        <h1 className="page-title">Files</h1>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <button className="btn btn-default" onClick={load}>Refresh</button>
          <button className="btn btn-default" onClick={() => { setNewName(''); setMkdirOpen(true) }}>New Folder</button>
          <button className="btn btn-primary" disabled={uploading} onClick={() => fileInput.current?.click()}>
            {uploading ? <><Spinner /> Uploading…</> : 'Upload'}
          </button>
          <input ref={fileInput} type="file" hidden onChange={e => e.target.files?.[0] && onUpload(e.target.files[0])} />
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="mono" style={{ marginBottom: 'var(--space-md)', display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
        <button className="btn btn-default" style={crumbBtn} onClick={() => setPath('')}>/var/www</button>
        {segs.map((s, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span>/</span>
            <button className="btn btn-default" style={crumbBtn} onClick={() => setPath(segs.slice(0, i + 1).join('/'))}>{s}</button>
          </span>
        ))}
      </div>

      <Card style={{ padding: 0, overflow: 'auto' }}>
        {loading && <div style={{ padding: 'var(--space-lg)' }}><Spinner /></div>}
        {!loading && (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead>
              <tr style={{ textAlign: 'left', background: 'var(--color-surface-2)' }}>
                {['Name', 'Size', 'Modified', 'Perms', 'Actions'].map(h => (
                  <th key={h} style={{ padding: 'var(--space-sm) var(--space-md)', fontSize: 12, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {path !== '' && (
                <tr style={{ borderTop: '1px solid #eee', cursor: 'pointer' }} onClick={() => setPath(parent(path))}>
                  <td colSpan={5} style={{ padding: 'var(--space-sm) var(--space-md)', fontWeight: 700 }}>📁 ..</td>
                </tr>
              )}
              {entries.map(e => (
                <tr key={e.name} style={{ borderTop: '1px solid #eee' }}>
                  <td style={{ padding: 'var(--space-sm) var(--space-md)', fontWeight: e.type === 'dir' ? 700 : 400 }}>
                    {e.type === 'dir'
                      ? <span style={{ cursor: 'pointer' }} onClick={() => setPath(join(path, e.name))}>📁 {e.name}</span>
                      : <span>📄 {e.name}</span>}
                  </td>
                  <td style={{ padding: 'var(--space-sm) var(--space-md)', color: 'var(--color-text-muted)' }}>
                    {e.type === 'dir' ? '—' : fmtSize(e.size)}
                  </td>
                  <td style={{ padding: 'var(--space-sm) var(--space-md)', color: 'var(--color-text-muted)', fontSize: 13 }}>
                    {e.mtime ? new Date(e.mtime * 1000).toLocaleString() : '—'}
                  </td>
                  <td className="mono" style={{ padding: 'var(--space-sm) var(--space-md)', fontSize: 13 }}>{e.perms}</td>
                  <td style={{ padding: 'var(--space-sm) var(--space-md)' }}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {e.type === 'file' && <button className="btn btn-default" style={btnSm} onClick={() => download(e)}>Download</button>}
                      {e.type === 'file' && <button className="btn btn-default" style={btnSm} onClick={() => openEdit(e)}>Edit</button>}
                      <button className="btn btn-default" style={btnSm} onClick={() => { setRenameTarget(e); setRenameTo(e.name) }}>Rename</button>
                      <button className="btn btn-danger" style={btnSm} onClick={() => setDelTarget(e)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 'var(--space-lg)', color: 'var(--color-text-muted)' }}>Empty directory.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </Card>

      {/* Editor */}
      <Modal open={!!editor} title={editor ? `Edit — ${editor.path}` : ''} onClose={() => !savingEdit && setEditor(null)} width={760}>
        {editor && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            <textarea
              className="mono-surface"
              style={{ width: '100%', minHeight: 360, resize: 'vertical' }}
              value={editor.content}
              onChange={e => setEditor({ ...editor, content: e.target.value })}
            />
            {PHP_EXT.test(editor.path) && (
              <label style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center', fontSize: 13 }}>
                <input type="checkbox" checked={editor.allowPhp} onChange={e => setEditor({ ...editor, allowPhp: e.target.checked })} />
                Allow saving executable (.php) file
              </label>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)' }}>
              <button className="btn btn-default" onClick={() => setEditor(null)} disabled={savingEdit}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEdit} disabled={savingEdit}>{savingEdit ? <Spinner /> : 'Save'}</button>
            </div>
          </div>
        )}
      </Modal>

      {/* New folder */}
      <Modal open={mkdirOpen} title="New Folder" onClose={() => setMkdirOpen(false)}>
        <input className="input" placeholder="folder-name" autoFocus value={newName} onChange={e => setNewName(e.target.value)} style={{ marginBottom: 'var(--space-md)' }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)' }}>
          <button className="btn btn-default" onClick={() => setMkdirOpen(false)}>Cancel</button>
          <button className="btn btn-primary" disabled={!newName} onClick={doMkdir}>Create</button>
        </div>
      </Modal>

      {/* Rename */}
      <Modal open={!!renameTarget} title={`Rename — ${renameTarget?.name}`} onClose={() => setRenameTarget(null)}>
        <input className="input" autoFocus value={renameTo} onChange={e => setRenameTo(e.target.value)} style={{ marginBottom: 'var(--space-md)' }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)' }}>
          <button className="btn btn-default" onClick={() => setRenameTarget(null)}>Cancel</button>
          <button className="btn btn-primary" disabled={!renameTo} onClick={doRename}>Rename</button>
        </div>
      </Modal>

      {/* Delete — typed-confirm for directories (recursive) */}
      <ConfirmDialog
        open={!!delTarget}
        title={delTarget?.type === 'dir' ? 'Delete Directory' : 'Delete File'}
        message={delTarget?.type === 'dir'
          ? `Recursively delete the folder "${delTarget?.name}" and everything inside it.`
          : `Delete the file "${delTarget?.name}".`}
        confirmPhrase={delTarget?.type === 'dir' ? delTarget?.name : undefined}
        confirmLabel="Delete"
        danger
        busy={deleting}
        onConfirm={doDelete}
        onCancel={() => !deleting && setDelTarget(null)}
      />
    </div>
  )
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

const btnSm = { padding: '4px 10px', fontSize: 12 }
const crumbBtn = { padding: '2px 8px', fontSize: 12, textTransform: 'none' as const, letterSpacing: 0 }
