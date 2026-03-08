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
  button: {
    padding: '0.625rem',
    borderRadius: '0.375rem',
    border: 'none',
    background: '#2563eb',
    color: 'white',
    fontSize: '1rem',
    cursor: 'pointer',
    fontWeight: 600,
    minWidth: '10rem',
  },
}

export default function LoginPage() {
  const navigate = useNavigate()

  if (DEMO_MODE) {
    return (
      <div style={styles.container}>
        <h1 style={styles.heading}>Dev Console</h1>
        <p style={styles.subheading}>Try the demo</p>
        <button style={styles.button} onClick={() => navigate('/projects')}>
          Try Demo
        </button>
      </div>
    )
  }

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
