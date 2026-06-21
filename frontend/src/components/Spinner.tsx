// Tiny inline spinner. Keyframes injected once.
let injected = false
function ensureKeyframes() {
  if (injected) return
  injected = true
  const s = document.createElement('style')
  s.textContent = '@keyframes wo-spin{to{transform:rotate(360deg)}}'
  document.head.appendChild(s)
}

export function Spinner({ size = 16 }: { size?: number }) {
  ensureKeyframes()
  return (
    <span
      aria-label="loading"
      style={{
        display: 'inline-block', width: size, height: size,
        border: '2px solid var(--color-border)', borderTopColor: 'transparent',
        borderRadius: '50%', animation: 'wo-spin 0.7s linear infinite',
      }}
    />
  )
}
