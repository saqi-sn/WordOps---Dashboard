import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './theme.css'
import App from './App'

// HashRouter (not BrowserRouter): deep links live in the URL hash (#/sites), so a
// single index.html serves every route with NO nginx SPA-fallback rule needed.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
