import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import ProjectsPage from './pages/ProjectsPage'
import WorkspaceListPage from './pages/WorkspaceListPage'
import TerminalPage from './pages/TerminalPage'
import DemoBanner from './components/DemoBanner'
import WireframesIndex from './pages/wireframes/WireframesIndex'
import VariantA from './pages/wireframes/VariantA'
import VariantB from './pages/wireframes/VariantB'
import VariantC from './pages/wireframes/VariantC'
import { AuthProvider, useAuth } from './context/AuthContext'

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true'

function RootRoute() {
  const { user, loading } = useAuth()

  if (DEMO_MODE) {
    return <LoginPage />
  }

  if (loading) {
    return null
  }

  return user ? <Navigate to="/projects" replace /> : <LoginPage />
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (DEMO_MODE) {
    return <>{children}</>
  }

  if (loading) {
    return null
  }

  return user ? <>{children}</> : <Navigate to="/" replace />
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        {DEMO_MODE && <DemoBanner />}
        <Routes>
          <Route path="/" element={<RootRoute />} />
          <Route
            path="/projects"
            element={
              <AuthGuard>
                <ProjectsPage />
              </AuthGuard>
            }
          />
          <Route
            path="/projects/:pid/workspaces"
            element={
              <AuthGuard>
                <WorkspaceListPage />
              </AuthGuard>
            }
          />
          <Route
            path="/projects/:pid/workspaces/:wid/terminal"
            element={
              <AuthGuard>
                <TerminalPage />
              </AuthGuard>
            }
          />
          <Route path="/wireframes" element={<WireframesIndex />} />
          <Route path="/wireframes/variant-a" element={<VariantA />} />
          <Route path="/wireframes/variant-b" element={<VariantB />} />
          <Route path="/wireframes/variant-c" element={<VariantC />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
