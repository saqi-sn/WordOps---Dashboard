import { Navigate, Route, Routes } from 'react-router-dom'
import { auth } from './auth'
import { ToastProvider } from './components/Toast'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Sites } from './pages/Sites'
import { Backups } from './pages/Backups'
import { FileManager } from './pages/FileManager'
import { Stack } from './pages/Stack'
import { Logs } from './pages/Logs'
import type { ReactNode } from 'react'

function RequireAuth({ children }: { children: ReactNode }) {
  if (!auth.isAuthed()) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/sites" element={<Sites />} />
          <Route path="/backups" element={<Backups />} />
          <Route path="/files" element={<FileManager />} />
          <Route path="/stack" element={<Stack />} />
          <Route path="/logs" element={<Logs />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ToastProvider>
  )
}
