// Placeholder shell — real routes, layout, and route guard land in B3+.
// Confirms the scaffold (theme, fonts, build) renders before page work begins.
export default function App() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 'var(--space-xl)' }}>
      <div className="card" style={{ maxWidth: 480, textAlign: 'center' }}>
        <h1 className="page-title">WordOps Panel</h1>
        <p className="section-label">scaffold ready — phase b</p>
        <p style={{ color: 'var(--color-text-muted)' }}>
          Frontend scaffold is live. Auth, layout, and pages build next.
        </p>
        <button className="btn btn-primary">Illustration Theme</button>
      </div>
    </div>
  )
}
