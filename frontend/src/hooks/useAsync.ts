import { useCallback, useEffect, useState } from 'react'

interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string
  reload: () => void
}

// Run an async fn on mount (and on dep change); expose data/loading/error + reload.
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const run = useCallback(() => {
    setLoading(true)
    setError('')
    fn()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Request failed'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(run, [run])

  return { data, loading, error, reload: run }
}
