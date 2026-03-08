/**
 * Wireframe Variant A — Classic Card List
 *
 * Faithful translation of the ASCII wireframe (Screen 2 in WIREFRAMES.md):
 * a vertical list of full-width project cards with "New Project" in the
 * header. Each card shows the project name, repository URL, last-used time,
 * and a chevron arrow. Clicking "+ New Project" toggles an inline repository-
 * picker dialog (Screen 2a).
 */

import { useState } from 'react'

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const PROJECTS = [
  { id: 'my-project', name: 'my-project', repo: 'github.com/myorg/my-project', lastUsed: '2h' },
  { id: 'backend-api', name: 'backend-api', repo: 'github.com/myorg/backend-api', lastUsed: '1d' },
  { id: 'frontend-app', name: 'frontend-app', repo: 'github.com/myorg/frontend-app', lastUsed: '3d' },
]

const REPOS = [
  { full_name: 'myorg/my-project', language: 'Go', updated: '2h ago' },
  { full_name: 'myorg/backend-api', language: 'Go', updated: '1d ago' },
  { full_name: 'myorg/frontend-app', language: 'TypeScript', updated: '3d ago' },
  { full_name: 'myorg/docs', language: 'Markdown', updated: '1w ago' },
]

// ---------------------------------------------------------------------------
// Shared colour tokens (dark theme)
// ---------------------------------------------------------------------------

const C = {
  bg: '#0f172a',
  surface: '#1e293b',
  surfaceHover: '#263348',
  border: '#334155',
  text: '#f1f5f9',
  muted: '#94a3b8',
  blue: '#2563eb',
  blueHover: '#1d4ed8',
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
// Sub-components
// ---------------------------------------------------------------------------

function Header() {
  const s: Record<string, React.CSSProperties> = {
    bar: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0.75rem 1.5rem',
      background: C.surface,
      borderBottom: `1px solid ${C.border}`,
      flexShrink: 0,
    },
    logo: { fontWeight: 700, fontSize: '1.125rem', letterSpacing: '-0.01em' },
    right: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
    user: {
      padding: '0.25rem 0.625rem',
      borderRadius: '0.375rem',
      border: `1px solid ${C.border}`,
      fontSize: '0.875rem',
      color: C.muted,
      cursor: 'default',
    },
    logoutBtn: {
      padding: '0.25rem 0.625rem',
      borderRadius: '0.375rem',
      border: `1px solid ${C.border}`,
      background: 'transparent',
      color: C.muted,
      fontSize: '0.875rem',
      cursor: 'pointer',
    },
  }
  return (
    <header style={s.bar}>
      <span style={s.logo}>Dev Console</span>
      <div style={s.right}>
        <span style={s.user}>@alice ▾</span>
        <button style={s.logoutBtn}>Logout</button>
      </div>
    </header>
  )
}

function SectionHeader({ onNewProject }: { onNewProject: () => void }) {
  const s: Record<string, React.CSSProperties> = {
    row: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '1rem',
    },
    heading: { fontSize: '1.25rem', fontWeight: 600, margin: 0 },
    divider: { borderColor: C.border, margin: '0.5rem 0 1.25rem' },
    btn: {
      padding: '0.5rem 1rem',
      borderRadius: '0.375rem',
      border: 'none',
      background: C.blue,
      color: 'white',
      fontSize: '0.875rem',
      fontWeight: 600,
      cursor: 'pointer',
    },
  }
  return (
    <>
      <div style={s.row}>
        <h2 style={s.heading}>Projects</h2>
        <button style={s.btn} onClick={onNewProject}>+ New Project</button>
      </div>
      <hr style={s.divider} />
    </>
  )
}

function ProjectCard({ project }: { project: typeof PROJECTS[0] }) {
  const [hover, setHover] = useState(false)
  const s: Record<string, React.CSSProperties> = {
    card: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '1rem 1.25rem',
      background: hover ? C.surfaceHover : C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: '0.5rem',
      marginBottom: '0.75rem',
      cursor: 'pointer',
      transition: 'background 0.15s',
    },
    left: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
    name: { fontWeight: 600, fontSize: '1rem' },
    repo: { color: C.muted, fontSize: '0.875rem' },
    right: { display: 'flex', alignItems: 'center', gap: '1rem' },
    lastUsed: { color: C.muted, fontSize: '0.8125rem', whiteSpace: 'nowrap' },
    chevron: {
      width: '2rem',
      height: '2rem',
      borderRadius: '0.25rem',
      border: `1px solid ${C.border}`,
      background: 'transparent',
      color: C.muted,
      fontSize: '1rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
    },
  }
  return (
    <div
      style={s.card}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      role="button"
      tabIndex={0}
      aria-label={`Open project ${project.name}`}
      onKeyDown={activateOnKeyboard}
    >
      <div style={s.left}>
        <span style={s.name}>{project.name}</span>
        <span style={s.repo}>{project.repo}</span>
      </div>
      <div style={s.right}>
        <span style={s.lastUsed}>Last used: {project.lastUsed}</span>
        <div style={s.chevron}>›</div>
      </div>
    </div>
  )
}

function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  const filtered = REPOS.filter(r =>
    r.full_name.toLowerCase().includes(filter.toLowerCase())
  )

  function repoRowStyle(isSelected: boolean): React.CSSProperties {
    return {
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      padding: '0.75rem 1rem',
      background: isSelected ? '#1e3a5f' : 'transparent',
      cursor: 'pointer',
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
      maxWidth: '36rem',
    },
    dialogHeader: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '1rem',
    },
    dialogTitle: { fontWeight: 700, fontSize: '1.125rem', margin: 0 },
    closeBtn: {
      background: 'transparent',
      border: 'none',
      color: C.muted,
      fontSize: '1.25rem',
      cursor: 'pointer',
      padding: '0.25rem',
    },
    divider: { borderColor: C.border, margin: '0 0 1.25rem' },
    label: { fontSize: '0.875rem', color: C.muted, marginBottom: '0.5rem', display: 'block' },
    filterInput: {
      width: '100%',
      padding: '0.625rem 0.875rem',
      borderRadius: '0.375rem',
      border: `1px solid ${C.border}`,
      background: C.bg,
      color: C.text,
      fontSize: '0.875rem',
      boxSizing: 'border-box',
      marginBottom: '0.75rem',
    },
    repoList: {
      border: `1px solid ${C.border}`,
      borderRadius: '0.375rem',
      overflow: 'hidden',
      marginBottom: '1.25rem',
    },
    radioOuter: {
      width: '1rem',
      height: '1rem',
      borderRadius: '50%',
      border: `2px solid ${C.border}`,
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioInner: {
      width: '0.5rem',
      height: '0.5rem',
      borderRadius: '50%',
      background: C.blue,
    },
    repoName: { fontSize: '0.875rem', fontWeight: 500, flex: 1 },
    repoMeta: { fontSize: '0.8125rem', color: C.muted },
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
    addBtn: {
      padding: '0.5rem 1rem',
      borderRadius: '0.375rem',
      border: 'none',
      background: selected ? C.blue : '#334155',
      color: 'white',
      fontSize: '0.875rem',
      fontWeight: 600,
      cursor: selected ? 'pointer' : 'default',
    },
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.dialog} onClick={e => e.stopPropagation()}>
        <div style={s.dialogHeader}>
          <h3 style={s.dialogTitle}>Add Project</h3>
          <button style={s.closeBtn} onClick={onClose} aria-label="Close dialog">✕</button>
        </div>
        <hr style={s.divider} />
        <label style={s.label} htmlFor="variant-a-repo-filter">Select a repository</label>
        <input
          id="variant-a-repo-filter"
          type="search"
          placeholder="🔍 Filter repositories…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={s.filterInput}
        />
        <div style={s.repoList}>
          {filtered.map((repo, i) => (
            <div
              key={repo.full_name}
              style={{
                ...repoRowStyle(selected === repo.full_name),
                borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : 'none',
              }}
              onClick={() => setSelected(repo.full_name)}
            >
              <div style={s.radioOuter}>
                {selected === repo.full_name && <div style={s.radioInner} />}
              </div>
              <span style={s.repoName}>{repo.full_name}</span>
              <span style={s.repoMeta}>{repo.language} · Updated {repo.updated}</span>
            </div>
          ))}
        </div>
        <div style={s.actions}>
          <button style={s.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={s.addBtn} disabled={!selected}>Add Project ›</button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function VariantA() {
  const [showDialog, setShowDialog] = useState(false)

  const s: Record<string, React.CSSProperties> = {
    page: { display: 'flex', flexDirection: 'column', minHeight: '100vh', background: C.bg },
    content: { flex: 1, padding: '2rem 1.5rem', maxWidth: '56rem', margin: '0 auto', width: '100%' },
  }

  return (
    <div style={s.page}>
      <Header />
      <main style={s.content}>
        <SectionHeader onNewProject={() => setShowDialog(true)} />
        {PROJECTS.map(p => <ProjectCard key={p.id} project={p} />)}
      </main>
      {showDialog && <NewProjectDialog onClose={() => setShowDialog(false)} />}
    </div>
  )
}
