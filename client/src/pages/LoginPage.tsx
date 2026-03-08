import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true'

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '4rem 1rem 0',
  },
  heading: {
    fontSize: '2rem',
    fontWeight: 700,
    marginBottom: '0.5rem',
  },
  subheading: {
    fontSize: '1.25rem',
    color: '#94a3b8',
    marginBottom: '2rem',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    width: '100%',
    maxWidth: '20rem',
  },
  input: {
    padding: '0.625rem 0.75rem',
    borderRadius: '0.375rem',
    border: '1px solid #334155',
    background: '#1e293b',
    color: '#f1f5f9',
    fontSize: '1rem',
  },
  button: {
    padding: '0.625rem',
    borderRadius: '0.375rem',
    border: 'none',
    background: '#2563eb',
    color: 'white',
    fontSize: '1rem',
    cursor: 'pointer',
    fontWeight: 600,
  },
  error: {
    color: '#f87171',
    fontSize: '0.875rem',
    margin: 0,
  },
}

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  if (!DEMO_MODE) {
    return (
      <div style={styles.container}>
        <h1 style={styles.heading}>Dev Console</h1>
        <p style={styles.subheading}>Sign in to continue</p>
        <a href="/auth/login">
          <button style={styles.button}>Sign in with GitHub</button>
        </a>
      </div>
    )
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password === 'demo') {
      navigate('/demo')
    } else {
      setError('Incorrect password. Try "demo".')
    }
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.heading}>Dev Console</h1>
      <p style={styles.subheading}>Try the demo</p>
      <form onSubmit={handleSubmit} style={styles.form}>
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-label="Demo password"
          style={styles.input}
        />
        <button type="submit" style={styles.button}>
          Log in
        </button>
        {error && <p style={styles.error}>{error}</p>}
      </form>
    </div>
  )
}
