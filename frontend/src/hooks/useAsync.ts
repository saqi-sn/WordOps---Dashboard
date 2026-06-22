import { useCallback, useEffect, useState } from 'react'

interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string
  reload: () => void
}

// Cache backed by sessionStorage so data survives both in-app navigation AND a
// page reload (F5) — it's only refetched on Refresh / after an action. Cleared
// when the tab closes. In-memory mirror avoids JSON parsing on every read.
const mem = new Map<string, unknown>()
const KEY = (k: string) => `wo_cache:${k}`

function cacheGet<T>(key: string): T | undefined {
  if (mem.has(key)) return mem.get(key) as T
  try {
    const raw = sessionStorage.getItem(KEY(key))
    if (raw === null) return undefined
    const v = JSON.parse(raw) as T
    mem.set(key, v)
    return v
  } catch { return undefined }
}

function cacheSet<T>(key: string, v: T) {
  mem.set(key, v)
  try { sessionStorage.setItem(KEY(key), JSON.stringify(v)) } catch { /* quota/availability */ }
}

function cacheHas(key: string): boolean {
  return mem.has(key) || (() => { try { return sessionStorage.getItem(KEY(key)) !== null } catch { return false } })()
}

export function invalidate(key?: string) {
  if (key === undefined) {
    mem.clear()
    try { Object.keys(sessionStorage).filter(k => k.startsWith('wo_cache:')).forEach(k => sessionStorage.removeItem(k)) } catch { /* ignore */ }
  } else {
    mem.delete(key)
    try { sessionStorage.removeItem(KEY(key)) } catch { /* ignore */ }
  }
}

// Run an async fn on mount; expose data/loading/error + reload.
// With `cacheKey`: serve cached value on mount (no refetch); reload() refetches
// and refreshes the cache.
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = [], cacheKey?: string): AsyncState<T> {
  const cached = cacheKey !== undefined ? cacheGet<T>(cacheKey) : undefined
  const [data, setData] = useState<T | null>(cached ?? null)
  const [loading, setLoading] = useState(cached === undefined)
  const [error, setError] = useState('')

  const run = useCallback(() => {
    setLoading(true)
    setError('')
    fn()
      .then(d => { if (cacheKey !== undefined) cacheSet(cacheKey, d); setData(d) })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Request failed'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    if (cacheKey !== undefined && cacheHas(cacheKey)) {
      setData(cacheGet<T>(cacheKey) as T)   // serve cached, no fetch
      setLoading(false)
    } else {
      run()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run])

  return { data, loading, error, reload: run }
}
