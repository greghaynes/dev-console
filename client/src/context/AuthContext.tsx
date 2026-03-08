// Auth context providing the authenticated user to the component tree.
// The context makes a single GET /api/whoami request on mount and exposes the result.
// In demo mode, MSW intercepts the request and returns a demo user automatically.

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

export interface User {
  login: string
  id: number
}

interface AuthState {
  user: User | null
  loading: boolean
}

const AuthContext = createContext<AuthState>({ user: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/whoami')
      .then(r => (r.ok ? (r.json() as Promise<User>) : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(u => {
        setUser(u)
        setLoading(false)
      })
      .catch(() => {
        setUser(null)
        setLoading(false)
      })
  }, [])

  return <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  return useContext(AuthContext)
}
