// Shared API types. Shapes mirror the PHP backend responses exactly.

export interface Site {
  domain: string
  type: string          // wp, html, proxy, etc.
  php: string
  cache: string         // fastcgi, redis, none
  ssl: boolean
  status: 'enabled' | 'disabled'
}

export type SiteInfo = Record<string, string>

export interface CreateSite {
  domain: string
  type: 'wp' | 'html' | 'proxy' | 'php'
  php: '74' | '80' | '81' | '82' | '83'
  cache: 'fastcgi' | 'redis' | 'none'
  ssl: boolean
  proxyTarget?: string  // host:port when type=proxy
}

export interface Backup {
  filename: string
  size_mb: number
  created_at: number    // unix timestamp
  in_s3: boolean
}

export interface FileEntry {
  name: string
  type: 'file' | 'dir'
  size: number
  mtime: number
  perms: string         // e.g. "rwxr-xr-x"
}

export interface StackService {
  name: string
  status: 'running' | 'stopped' | 'unknown'
}

export interface StackStatus {
  services: StackService[]
  output?: string
}

export interface DiskInfo {
  total: string
  used: string
  available: string
  percent: number
}

export interface UptimeInfo {
  uptime: string
  load: number[]
}

export interface LogResponse {
  type: string
  lines: number
  content: string
}

// Generic { ok, output } command result (create/delete/enable/restart/…).
export interface CommandResult {
  ok: boolean
  output?: string
  error?: string
}
