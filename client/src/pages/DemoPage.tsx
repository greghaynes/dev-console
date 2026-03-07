const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingTop: '4rem',
    padding: '4rem 1rem 0',
    textAlign: 'center',
  },
  heading: {
    fontSize: '2rem',
    fontWeight: 700,
    marginBottom: '1rem',
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: '1.125rem',
  },
}

export default function DemoPage() {
  return (
    <div style={styles.container}>
      <h1 style={styles.heading}>You're in — demo mode active</h1>
      <p style={styles.subtitle}>
        This is a placeholder. More features coming in later phases.
      </p>
    </div>
  )
}
