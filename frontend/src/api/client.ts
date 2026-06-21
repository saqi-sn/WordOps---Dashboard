import { auth } from '../auth'
import type {
  Site, SiteInfo, CreateSite, Backup, FileEntry,
  StackStatus, DiskInfo, UptimeInfo, LogResponse, CommandResult,
} from './types'

// API entry. Query-string routing: every call hits /api/index.php?p=/route so the
// URL ends in .php and default WordOps php-site nginx routes it to PHP-FPM untouched.
const BASE = import.meta.env.VITE_API_URL ?? '/api/index.php'

// Fold a route like "/files/list?path=x" into "/api/index.php?p=/files/list&path=x".
function apiUrl(path: string): string {
  const qi = path.indexOf('?')
  const route = qi === -1 ? path : path.slice(0, qi)
  const params = new URLSearchParams(qi === -1 ? '' : path.slice(qi + 1))
  params.set('p', route)
  return `${BASE}?${params.toString()}`
}

// HashRouter login path (auth cleared on 401).
function gotoLogin() {
  if (!location.hash.includes('/login')) location.hash = '#/login'
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...options,
    headers: {
      Authorization: `Bearer ${auth.get()}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  if (res.status === 401) {
    auth.clear()
    gotoLogin()
    throw new ApiError(401, 'Unauthorized')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (data && (data.error || data.output)) || `API error ${res.status}`
    throw new ApiError(res.status, msg)
  }
  return data as T
}

// Authenticated binary fetch → triggers a browser download (Bearer can't ride <a href>).
async function download(path: string, filename: string): Promise<void> {
  const res = await fetch(apiUrl(path), {
    headers: { Authorization: `Bearer ${auth.get()}` },
  })
  if (res.status === 401) {
    auth.clear()
    gotoLogin()
    throw new ApiError(401, 'Unauthorized')
  }
  if (!res.ok) throw new ApiError(res.status, `Download failed ${res.status}`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// Authenticated multipart upload (FormData; no JSON Content-Type).
async function upload(path: string, form: FormData): Promise<CommandResult> {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { Authorization: `Bearer ${auth.get()}` },
    body: form,
  })
  if (res.status === 401) {
    auth.clear()
    gotoLogin()
    throw new ApiError(401, 'Unauthorized')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, data.error || `Upload failed ${res.status}`)
  return data as CommandResult
}

export const api = {
  download,
  upload,
  auth: {
    login: (username: string, password: string) =>
      request<{ token: string; expires_in: number }>('/auth/login', {
        method: 'POST', body: JSON.stringify({ username, password }),
      }),
    me: () => request<{ user: string }>('/auth/me'),
  },
  sites: {
    list: () => request<{ sites: Site[] }>('/sites').then(r => r.sites),
    info: (d: string) => request<{ info: SiteInfo }>(`/sites/${d}/info`).then(r => r.info),
    create: (body: CreateSite) =>
      request<CommandResult>('/sites', { method: 'POST', body: JSON.stringify(body) }),
    remove: (d: string) => request<CommandResult>(`/sites/${d}`, { method: 'DELETE' }),
    enable: (d: string) => request<CommandResult>(`/sites/${d}/enable`, { method: 'POST' }),
    disable: (d: string) => request<CommandResult>(`/sites/${d}/disable`, { method: 'POST' }),
    purgeCache: (d: string) => request<CommandResult>(`/sites/${d}/cache/purge`, { method: 'POST' }),
  },
  backups: {
    list: (d: string) => request<{ backups: Backup[] }>(`/sites/${d}/backups`).then(r => r.backups),
    create: (d: string) => request<CommandResult>(`/sites/${d}/backups`, { method: 'POST' }),
    download: (d: string, f: string) =>
      api.download(`/sites/${d}/backups/${encodeURIComponent(f)}`, f),
    delete: (d: string, f: string) =>
      request<CommandResult>(`/sites/${d}/backups/${encodeURIComponent(f)}`, { method: 'DELETE' }),
    pushS3: (d: string, f: string) =>
      request<{ ok: boolean; key?: string; error?: string }>(
        `/sites/${d}/backups/${encodeURIComponent(f)}/s3`, { method: 'POST' }),
  },
  files: {
    list: (path = '') =>
      request<{ entries: FileEntry[] }>(`/files/list?path=${encodeURIComponent(path)}`).then(r => r.entries),
    read: (path: string) =>
      request<{ content: string }>(`/files/read?path=${encodeURIComponent(path)}`),
    write: (path: string, content: string, allowPhp = false) =>
      request<CommandResult>('/files/write', {
        method: 'POST', body: JSON.stringify({ path, content, allow_php: allowPhp }),
      }),
    download: (path: string, filename: string) =>
      api.download(`/files/download?path=${encodeURIComponent(path)}`, filename),
    mkdir: (path: string) =>
      request<CommandResult>('/files/mkdir', { method: 'POST', body: JSON.stringify({ path }) }),
    rename: (from: string, to: string) =>
      request<CommandResult>('/files/rename', { method: 'POST', body: JSON.stringify({ from, to }) }),
    delete: (path: string, recursive = false) =>
      request<CommandResult>(`/files?path=${encodeURIComponent(path)}&recursive=${recursive}`, { method: 'DELETE' }),
    upload: (dir: string, file: File, allowPhp = false) => {
      const form = new FormData()
      form.append('file', file)
      form.append('path', dir)
      if (allowPhp) form.append('allow_php', '1')
      return api.upload('/files/upload', form)
    },
  },
  stack: {
    status: () => request<StackStatus>('/stack/status'),
    restart: (s: string) => request<CommandResult>(`/stack/${s}/restart`, { method: 'POST' }),
    start: (s: string) => request<CommandResult>(`/stack/${s}/start`, { method: 'POST' }),
    stop: (s: string) => request<CommandResult>(`/stack/${s}/stop`, { method: 'POST' }),
  },
  logs: {
    get: (type: string, lines = 200) => request<LogResponse>(`/logs/${type}?lines=${lines}`),
  },
  system: {
    disk: () => request<DiskInfo>('/system/disk'),
    uptime: () => request<UptimeInfo>('/system/uptime'),
  },
}

export { ApiError }
