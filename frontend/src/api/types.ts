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
  wp_user?: string      // optional WP admin (wp sites); blank -> WordOps default
  wp_pass?: string
  wp_email?: string
}

export interface PhpVersion {
  code: string   // e.g. "83"
  label: string  // e.g. "8.3"
}

export interface Backup {
  filename: string
  kind: 'database' | 'files' | 'other'
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
  wp_user?: string  // returned by site create for wp sites
  wp_pass?: string
}
