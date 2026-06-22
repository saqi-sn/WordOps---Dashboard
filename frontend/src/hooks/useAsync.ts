import { useCallback, useEffect, useState } from 'react'

interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string
  reload: () => void
}

// Module-level cache shared across page mounts. Keyed by a caller-supplied string.
// Lets pages serve cached data on navigation and only refetch on Refresh / actions.
const cache = new Map<string, unknown>()

// Drop a cached entry (or all). Call after mutations that invalidate other views.
export function invalidate(key?: string) {
  if (key === undefined) cache.clear()
  else cache.delete(key)
}

// Run an async fn on mount; expose data/loading/error + reload.
// When `cacheKey` is given: the first load fills the cache; later mounts serve the
// cached value WITHOUT refetching. `reload()` always refetches and refreshes the cache.
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = [], cacheKey?: string): AsyncState<T> {
  const cached = cacheKey !== undefined ? (cache.get(cacheKey) as T | undefined) : undefined
  const [data, setData] = useState<T | null>(cached ?? null)
  const [loading, setLoading] = useState(cached === undefined)
  const [error, setError] = useState('')

  const run = useCallback(() => {
    setLoading(true)
    setError('')
    fn()
      .then(d => { if (cacheKey !== undefined) cache.set(cacheKey, d); setData(d) })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Request failed'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    if (cacheKey !== undefined && cache.has(cacheKey)) {
      setData(cache.get(cacheKey) as T)   // serve cached, no fetch
      setLoading(false)
    } else {
      run()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run])

  return { data, loading, error, reload: run }
}
