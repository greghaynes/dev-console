import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import ProjectsPage from './pages/ProjectsPage'
import DemoBanner from './components/DemoBanner'
import WireframesIndex from './pages/wireframes/WireframesIndex'
import VariantA from './pages/wireframes/VariantA'
import VariantB from './pages/wireframes/VariantB'
import VariantC from './pages/wireframes/VariantC'

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true'

// RootRoute handles the "/" path.
// In demo mode the login page is always shown so users can click "Try Demo".
// In production the auth state decides: authenticated → /projects, otherwise → LoginPage.
function RootRoute() {
  const { user, loading } = useAuth()

  if (DEMO_MODE) return <LoginPage />
  if (loading) return null
  if (user) return <Navigate to="/projects" replace />
  return <LoginPage />
}

// AuthGuard wraps protected routes and redirects to "/" when not authenticated.
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) return null
  if (!user) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        {DEMO_MODE && <DemoBanner />}
        <Routes>
          <Route path="/" element={<RootRoute />} />
          <Route path="/projects" element={<AuthGuard><ProjectsPage /></AuthGuard>} />
          <Route path="/wireframes" element={<WireframesIndex />} />
          <Route path="/wireframes/variant-a" element={<VariantA />} />
          <Route path="/wireframes/variant-b" element={<VariantB />} />
          <Route path="/wireframes/variant-c" element={<VariantC />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
