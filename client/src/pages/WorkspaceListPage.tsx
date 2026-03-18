/**
 * WorkspaceListPage — lists workspaces for the selected project.
 *
 * Fetches project metadata from GET /api/projects/:pid and workspaces from
 * GET /api/projects/:pid/workspaces.  Provides buttons to create a new
 * workspace and to open a terminal for an existing one.
 */

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

// ---------------------------------------------------------------------------
// API types
// ---------------------------------------------------------------------------

interface ApiProject {
  id: string
  name: string
  repoURL: string
  createdAt: string
}

interface ApiWorkspace {
  id: string
  projectId: string
  name: string
  branch: string
  prNumber: number | null
  createdAt: string
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

const C = {
  bg: '#0f172a',
  surface: '#1e293b',
  surfaceHover: '#263348',
  border: '#334155',
  text: '#f1f5f9',
  muted: '#94a3b8',
  blue: '#2563eb',
  blueLight: '#93c5fd',
  red: '#dc2626',
}

// ---------------------------------------------------------------------------
// Keyboard accessibility helper
// ---------------------------------------------------------------------------

function activateOnKeyboard(e: React.KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).click()
  }
}

// ---------------------------------------------------------------------------
// New Workspace dialog
// ---------------------------------------------------------------------------

function NewWorkspaceDialog({
  onClose,
  onCreated,
  pid,
}: {
  onClose: () => void
  onCreated: () => void
  pid: string
}) {
  const [branch, setBranch] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    const b = branch.trim()
    if (!b || creating) return
    setCreating(true)
    setError(null)
    try {
      const r = await fetch(`/api/projects/${pid}/workspaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: b }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      onCreated()
      onClose()
    } catch (err) {
      setError(String(err))
    } finally {
      setCreating(false)
    }
  }

  const s: Record<string, React.CSSProperties> = {
    overlay: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 50,
      padding: '1rem',
    },
    dialog: {
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: '0.75rem',
      padding: '1.5rem',
      width: '100%',
      maxWidth: '28rem',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '1.25rem',
    },
    title: { fontWeight: 700, fontSize: '1.125rem', margin: 0 },
    closeBtn: {
      background: 'transparent',
      border: 'none',
      color: C.muted,
      fontSize: '1.25rem',
      cursor: 'pointer',
      padding: '0.25rem',
    },
    label: { fontSize: '0.875rem', color: C.muted, marginBottom: '0.5rem', display: 'block' },
    input: {
      width: '100%',
      padding: '0.625rem 0.875rem',
      borderRadius: '0.375rem',
      border: `1px solid ${C.border}`,
      background: C.bg,
      color: C.text,
      fontSize: '0.875rem',
      boxSizing: 'border-box',
      marginBottom: '1rem',
    },
    errorMsg: { fontSize: '0.8125rem', color: '#f87171', marginBottom: '0.75rem', textAlign: 'right' },
    actions: { display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' },
    cancelBtn: {
      padding: '0.5rem 1rem',
      borderRadius: '0.375rem',
      border: `1px solid ${C.border}`,
      background: 'transparent',
      color: C.text,
      fontSize: '0.875rem',
      cursor: 'pointer',
    },
    createBtn: {
      padding: '0.5rem 1rem',
      borderRadius: '0.375rem',
      border: 'none',
      background: branch.trim() && !creating ? C.blue : '#334155',
      color: 'white',
      fontSize: '0.875rem',
      fontWeight: 600,
      cursor: branch.trim() && !creating ? 'pointer' : 'default',
    },
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.dialog} onClick={e => e.stopPropagation()}>
        <div style={s.header}>
          <h3 style={s.title}>New Workspace</h3>
          <button style={s.closeBtn} onClick={onClose} aria-label="Close dialog">✕</button>
        </div>
        <label style={s.label} htmlFor="ws-branch-input">Branch name</label>
        <input
          id="ws-branch-input"
          type="text"
          placeholder="e.g. main"
          value={branch}
          onChange={e => setBranch(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
          style={s.input}
          autoFocus
        />
        {error && <div style={s.errorMsg}>{error}</div>}
        <div style={s.actions}>
          <button style={s.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            style={s.createBtn}
            disabled={!branch.trim() || creating}
            onClick={handleCreate}
          >
            {creating ? 'Creating…' : 'Create ›'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Workspace row
// ---------------------------------------------------------------------------

function WorkspaceRow({
  ws,
  pid,
  onDelete,
}: {
  ws: ApiWorkspace
  pid: string
  onDelete: () => void
}) {
  const navigate = useNavigate()
  const [hover, setHover] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (deleting) return
    setDeleting(true)
    try {
      const r = await fetch(`/api/projects/${pid}/workspaces/${ws.id}`, {
        method: 'DELETE',
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      onDelete()
    } catch {
      setDeleting(false)
    }
  }

  const s: Record<string, React.CSSProperties> = {
    row: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.875rem',
      padding: '0.875rem 1rem',
      background: hover ? C.surfaceHover : 'transparent',
      borderBottom: `1px solid ${C.border}`,
      cursor: 'pointer',
      transition: 'background 0.15s',
    },
    branch: { fontFamily: 'monospace', fontSize: '0.9375rem', flex: 1, fontWeight: 500 },
    meta: { fontSize: '0.8125rem', color: C.muted, whiteSpace: 'nowrap' },
    openBtn: {
      padding: '0.375rem 0.875rem',
      borderRadius: '0.375rem',
      border: 'none',
      background: C.blue,
      color: 'white',
      fontSize: '0.8125rem',
      fontWeight: 600,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
    },
    deleteBtn: {
      padding: '0.375rem 0.625rem',
      borderRadius: '0.375rem',
      border: `1px solid ${C.border}`,
      background: 'transparent',
      color: C.muted,
      fontSize: '0.8125rem',
      cursor: deleting ? 'default' : 'pointer',
      whiteSpace: 'nowrap',
    },
  }

  return (
    <div
      style={s.row}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => navigate(`/projects/${pid}/workspaces/${ws.id}`)}
      role="button"
      tabIndex={0}
      aria-label={`Open workspace ${ws.name}`}
      onKeyDown={activateOnKeyboard}
    >
      <span style={{ color: C.muted, fontSize: '0.875rem', flexShrink: 0 }}>⎇</span>
      <span style={s.branch}>{ws.branch}</span>
      {ws.prNumber != null && (
        <span style={{ fontSize: '0.8125rem', color: C.blueLight }}>PR #{ws.prNumber}</span>
      )}
      <span style={s.meta}>{new Date(ws.createdAt).toLocaleDateString()}</span>
      <button
        style={s.openBtn}
        onClick={e => { e.stopPropagation(); navigate(`/projects/${pid}/workspaces/${ws.id}`) }}
        aria-label={`Open workspace ${ws.branch}`}
      >
        Open ›
      </button>
      <button
        style={s.deleteBtn}
        onClick={handleDelete}
        disabled={deleting}
        aria-label={`Delete workspace ${ws.branch}`}
      >
        {deleting ? '…' : '✕'}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function WorkspaceListPage() {
  const { pid } = useParams<{ pid: string }>()
  const navigate = useNavigate()
  const [project, setProject] = useState<ApiProject | null>(null)
  const [workspaces, setWorkspaces] = useState<ApiWorkspace[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showDialog, setShowDialog] = useState(false)

  function fetchData() {
    if (!pid) return
    setLoading(true)
    setError(null)
    Promise.all([
      fetch(`/api/projects/${pid}`).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<ApiProject>
      }),
      fetch(`/api/projects/${pid}/workspaces`).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<ApiWorkspace[]>
      }),
    ])
      .then(([p, ws]) => {
        setProject(p)
        setWorkspaces(ws)
      })
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid])

  const s: Record<string, React.CSSProperties> = {
    page: { display: 'flex', flexDirection: 'column', minHeight: '100vh', background: C.bg, color: C.text },
    header: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      padding: '0.75rem 1.5rem',
      background: C.surface,
      borderBottom: `1px solid ${C.border}`,
      flexShrink: 0,
    },
    backBtn: {
      background: 'transparent',
      border: `1px solid ${C.border}`,
      borderRadius: '0.375rem',
      color: C.muted,
      fontSize: '0.875rem',
      padding: '0.25rem 0.625rem',
      cursor: 'pointer',
    },
    logo: { fontWeight: 700, fontSize: '1.125rem' },
    breadcrumb: { color: C.muted, fontSize: '0.875rem' },
    tag: {
      padding: '0.125rem 0.5rem',
      borderRadius: '0.25rem',
      background: '#1e3a5f',
      color: C.blueLight,
      fontSize: '0.75rem',
      fontWeight: 600,
    },
    spacer: { flex: 1 },
    newBtn: {
      padding: '0.5rem 1rem',
      borderRadius: '0.375rem',
      border: 'none',
      background: C.blue,
      color: 'white',
      fontSize: '0.875rem',
      fontWeight: 600,
      cursor: 'pointer',
    },
    content: {
      flex: 1,
      padding: '2rem 1.5rem',
      maxWidth: '56rem',
      margin: '0 auto',
      width: '100%',
      boxSizing: 'border-box',
    },
    sectionTitle: { fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' },
    card: {
      border: `1px solid ${C.border}`,
      borderRadius: '0.625rem',
      overflow: 'hidden',
    },
    emptyRow: { padding: '3rem', textAlign: 'center', color: C.muted },
    statusRow: { padding: '2rem', textAlign: 'center', color: C.muted },
    errorRow: { padding: '2rem', textAlign: 'center', color: '#f87171' },
  }

  return (
    <div style={s.page}>
      <header style={s.header}>
        <button
          style={s.backBtn}
          onClick={() => navigate('/projects')}
          aria-label="Back to projects"
        >
          ← Back
        </button>
        <span style={s.logo}>Dev Console</span>
        <span style={s.breadcrumb}>/</span>
        <span style={s.breadcrumb}>{project?.name ?? pid}</span>
        <span style={s.tag}>Workspaces</span>
        <div style={s.spacer} />
        <button style={s.newBtn} onClick={() => setShowDialog(true)} aria-label="New workspace">
          + New Workspace
        </button>
      </header>
      <main style={s.content}>
        {loading ? (
          <div style={s.statusRow}>Loading…</div>
        ) : error ? (
          <div style={s.errorRow}>{error}</div>
        ) : (
          <>
            <div style={s.sectionTitle}>
              {workspaces.length} workspace{workspaces.length !== 1 ? 's' : ''}
            </div>
            <div style={s.card}>
              {workspaces.length === 0 ? (
                <div style={s.emptyRow}>
                  No workspaces yet. Create one to get started.
                </div>
              ) : (
                workspaces.map(ws => (
                  <WorkspaceRow
                    key={ws.id}
                    ws={ws}
                    pid={pid!}
                    onDelete={fetchData}
                  />
                ))
              )}
            </div>
          </>
        )}
      </main>
      {showDialog && pid && (
        <NewWorkspaceDialog
          pid={pid}
          onClose={() => setShowDialog(false)}
          onCreated={fetchData}
        />
      )}
    </div>
  )
}
