/**
 * ProjectsPage — responsive project-selection wireframe.
 *
 * On desktop (≥ 768 px): Variant C — compact table with search filter and
 * in-place accordion workspace expansion.
 * On mobile (< 768 px):  Variant A — classic full-width card list with a
 * centred "Add Project" modal.
 *
 * Both views share the same mock data and colour tokens so the page can be
 * dropped into a functional implementation later without structural changes.
 */

import { useEffect, useState } from 'react'

// ---------------------------------------------------------------------------
// API types
// ---------------------------------------------------------------------------

interface ApiProject {
  id: string
  name: string
  repoURL: string
  createdAt: string
}

interface ApiRepo {
  id: number
  fullName: string
  description: string
  language: string
  updatedAt: string
  htmlURL: string
}

// ---------------------------------------------------------------------------
// UI types
// ---------------------------------------------------------------------------

interface UiWorkspace {
  id: string
  branch: string
  pr: string | null
  lastUsed: string
}

interface UiProject {
  id: string
  name: string
  repo: string
  repoDisplay: string
  language: string
  lastUsed: string
  lastUsedFull: string
  workspaces: UiWorkspace[]
}

function toUiProject(p: ApiProject): UiProject {
  let repo = ''
  let repoDisplay = p.repoURL
  try {
    const url = new URL(p.repoURL)
    repo = url.pathname.replace(/^\//, '')
    repoDisplay = url.host + url.pathname
  } catch {
    // fall back to raw URL
  }
  return {
    id: p.id,
    name: p.name,
    repo,
    repoDisplay,
    language: '',
    lastUsed: new Date(p.createdAt).toLocaleDateString(),
    lastUsedFull: new Date(p.createdAt).toLocaleString(),
    workspaces: [],
  }
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

const C = {
  bg: '#0f172a',
  surface: '#1e293b',
  surfaceHover: '#263348',
  expanded: '#162036',
  border: '#334155',
  text: '#f1f5f9',
  muted: '#94a3b8',
  blue: '#2563eb',
  blueLight: '#93c5fd',
}

const LANG_COLORS: Record<string, string> = {
  Go: '#00acd7',
  TypeScript: '#3178c6',
  Markdown: '#7c3aed',
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
// Responsive hook
// ---------------------------------------------------------------------------

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return isDesktop
}

// ---------------------------------------------------------------------------
// Shared: "Add Project" dialog  (used by both views)
// ---------------------------------------------------------------------------

function AddProjectDialog({ onClose, onAdd }: { onClose: () => void; onAdd: () => void }) {
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<ApiRepo | null>(null)
  const [repos, setRepos] = useState<ApiRepo[]>([])
  const [reposLoading, setReposLoading] = useState(true)
  const [reposError, setReposError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/github/repos')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<ApiRepo[]>
      })
      .then(data => setRepos(data))
      .catch(err => setReposError(String(err)))
      .finally(() => setReposLoading(false))
  }, [])

  const filtered = repos.filter(r =>
    r.fullName.toLowerCase().includes(filter.toLowerCase()),
  )

  async function handleAdd() {
    if (!selected || adding) return
    setAdding(true)
    setAddError(null)
    try {
      const r = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoURL: selected.htmlURL }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      onAdd()
      onClose()
    } catch (err) {
      setAddError(String(err))
    } finally {
      setAdding(false)
    }
  }

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
    loadingRow: {
      padding: '1.5rem',
      textAlign: 'center',
      color: C.muted,
      fontSize: '0.875rem',
    },
    errorRow: {
      padding: '1.5rem',
      textAlign: 'center',
      color: '#f87171',
      fontSize: '0.875rem',
    },
    addErrorMsg: {
      fontSize: '0.8125rem',
      color: '#f87171',
      marginBottom: '0.75rem',
      textAlign: 'right',
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
    radioInner: { width: '0.5rem', height: '0.5rem', borderRadius: '50%', background: C.blue },
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
      background: selected && !adding ? C.blue : '#334155',
      color: 'white',
      fontSize: '0.875rem',
      fontWeight: 600,
      cursor: selected && !adding ? 'pointer' : 'default',
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
        <label style={s.label} htmlFor="projects-page-repo-filter">Select a repository</label>
        <input
          id="projects-page-repo-filter"
          type="search"
          placeholder="🔍 Filter repositories…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={s.filterInput}
        />
        <div style={s.repoList}>
          {reposLoading ? (
            <div style={s.loadingRow}>Loading…</div>
          ) : reposError ? (
            <div style={s.errorRow}>{reposError}</div>
          ) : (
            filtered.map((repo, i) => (
              <div
                key={repo.id}
                style={{
                  ...repoRowStyle(selected?.id === repo.id),
                  borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : 'none',
                }}
                onClick={() => setSelected(repo)}
              >
                <div style={s.radioOuter}>
                  {selected?.id === repo.id && <div style={s.radioInner} />}
                </div>
                <span style={s.repoName}>{repo.fullName}</span>
                <span style={s.repoMeta}>
                  {repo.language} · Updated {new Date(repo.updatedAt).toLocaleDateString()}
                </span>
              </div>
            ))
          )}
        </div>
        {addError && <div style={s.addErrorMsg}>{addError}</div>}
        <div style={s.actions}>
          <button style={s.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={s.addBtn} disabled={!selected || adding} onClick={handleAdd}>
            {adding ? 'Adding…' : 'Add Project ›'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Desktop view (Variant C)
// ---------------------------------------------------------------------------

function WorkspaceRow({ ws }: { ws: UiWorkspace }) {
  const [hover, setHover] = useState(false)
  const s: Record<string, React.CSSProperties> = {
    row: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      padding: '0.625rem 1rem 0.625rem 3.5rem',
      background: hover ? '#1a2940' : 'transparent',
      borderTop: `1px solid ${C.border}`,
      cursor: 'pointer',
      transition: 'background 0.15s',
    },
    branchIcon: { color: C.muted, fontSize: '0.875rem', flexShrink: 0 },
    branch: { fontFamily: 'monospace', fontSize: '0.8125rem', flex: 1 },
    pr: { fontSize: '0.8125rem', color: C.blueLight },
    lastUsed: { fontSize: '0.75rem', color: C.muted, marginRight: '0.5rem' },
    openBtn: {
      padding: '0.25rem 0.75rem',
      borderRadius: '0.25rem',
      border: `1px solid ${C.border}`,
      background: 'transparent',
      color: C.text,
      fontSize: '0.75rem',
      fontWeight: 600,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
    },
  }
  return (
    <div
      style={s.row}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span style={s.branchIcon}>⎇</span>
      <span style={s.branch}>{ws.branch}</span>
      {ws.pr
        ? <span style={s.pr}>PR {ws.pr}</span>
        : <span style={{ ...s.pr, color: C.muted }}>–</span>}
      <span style={s.lastUsed}>{ws.lastUsed}</span>
      <button style={s.openBtn}>Open ›</button>
    </div>
  )
}

function ProjectTableRow({ project }: { project: UiProject }) {
  const [expanded, setExpanded] = useState(false)
  const [hover, setHover] = useState(false)

  const rowBg = expanded ? C.expanded : hover ? C.surfaceHover : 'transparent'

  const s: Record<string, React.CSSProperties> = {
    wrapper: { borderBottom: `1px solid ${C.border}` },
    row: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.875rem',
      padding: '0.875rem 1rem',
      background: rowBg,
      cursor: 'pointer',
      transition: 'background 0.15s',
    },
    chevron: {
      fontSize: '0.875rem',
      color: C.muted,
      transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
      transition: 'transform 0.2s',
      flexShrink: 0,
      width: '1.25rem',
      textAlign: 'center',
    },
    name: { fontWeight: 600, fontSize: '0.9375rem', flex: '0 0 auto', minWidth: '10rem' },
    repo: { color: C.muted, fontSize: '0.8125rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    langDot: {
      width: '0.625rem',
      height: '0.625rem',
      borderRadius: '50%',
      background: LANG_COLORS[project.language] ?? C.muted,
      flexShrink: 0,
    },
    lang: { fontSize: '0.8125rem', color: C.muted, minWidth: '5rem' },
    lastUsed: { fontSize: '0.8125rem', color: C.muted, minWidth: '7rem', textAlign: 'right' },
    wsCount: {
      padding: '0.125rem 0.5rem',
      borderRadius: '9999px',
      background: '#1e3a5f',
      color: C.blueLight,
      fontSize: '0.75rem',
      fontWeight: 500,
    },
  }
  return (
    <div style={s.wrapper}>
      <div
        style={s.row}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={() => setExpanded(x => !x)}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={`${project.name}: ${expanded ? 'collapse' : 'expand'} workspaces`}
        onKeyDown={activateOnKeyboard}
      >
        <span style={s.chevron}>›</span>
        <span style={s.name}>{project.name}</span>
        <span style={s.repo}>github.com/{project.repo}</span>
        <span style={s.langDot} />
        <span style={s.lang}>{project.language}</span>
        <span style={s.wsCount}>{project.workspaces.length} ws</span>
        <span style={s.lastUsed}>{project.lastUsedFull}</span>
      </div>
      {expanded && project.workspaces.map(ws => (
        <WorkspaceRow key={ws.id} ws={ws} />
      ))}
    </div>
  )
}

function DesktopView({ onNewProject, projects }: { onNewProject: () => void; projects: UiProject[] }) {
  const [query, setQuery] = useState('')

  const filtered = projects.filter(
    p =>
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.repo.toLowerCase().includes(query.toLowerCase()),
  )

  const s: Record<string, React.CSSProperties> = {
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0.75rem 1.5rem',
      background: C.surface,
      borderBottom: `1px solid ${C.border}`,
    },
    headerLeft: { display: 'flex', alignItems: 'center', gap: '1rem' },
    logo: { fontWeight: 700, fontSize: '1.125rem' },
    tag: {
      padding: '0.125rem 0.5rem',
      borderRadius: '0.25rem',
      background: '#1e3a5f',
      color: C.blueLight,
      fontSize: '0.75rem',
      fontWeight: 600,
    },
    headerRight: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
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
    user: {
      padding: '0.25rem 0.625rem',
      borderRadius: '0.375rem',
      border: `1px solid ${C.border}`,
      fontSize: '0.875rem',
      color: C.muted,
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
    content: {
      flex: 1,
      padding: '2rem 1.5rem',
      maxWidth: '64rem',
      margin: '0 auto',
      width: '100%',
      boxSizing: 'border-box',
    },
    toolbar: { display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' },
    searchInput: {
      flex: 1,
      padding: '0.625rem 0.875rem',
      borderRadius: '0.375rem',
      border: `1px solid ${C.border}`,
      background: C.surface,
      color: C.text,
      fontSize: '0.9375rem',
      outline: 'none',
    },
    countLabel: { fontSize: '0.875rem', color: C.muted, whiteSpace: 'nowrap' },
    table: { border: `1px solid ${C.border}`, borderRadius: '0.625rem', overflow: 'hidden' },
    tableHeader: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.875rem',
      padding: '0.5rem 1rem',
      borderBottom: `1px solid ${C.border}`,
      background: C.surface,
    },
    col: { fontSize: '0.75rem', fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' },
    emptyRow: { padding: '2.5rem', textAlign: 'center', color: C.muted },
    hint: { color: C.muted, fontSize: '0.8125rem', marginTop: '0.75rem' },
  }

  return (
    <>
      <header style={s.header}>
        <div style={s.headerLeft}>
          <span style={s.logo}>Dev Console</span>
          <span style={s.tag}>Projects</span>
        </div>
        <div style={s.headerRight}>
          <button style={s.newBtn} onClick={onNewProject} aria-label="New project">
            + New Project
          </button>
          <span style={s.user}>@alice ▾</span>
          <button style={s.logoutBtn}>Logout</button>
        </div>
      </header>
      <main style={s.content}>
        <div style={s.toolbar}>
          <input
            type="search"
            placeholder="🔍 Search projects…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={s.searchInput}
            aria-label="Search projects"
          />
          <span style={s.countLabel}>{filtered.length} project{filtered.length !== 1 ? 's' : ''}</span>
        </div>
        <div style={s.table}>
          <div style={s.tableHeader}>
            <span style={{ ...s.col, width: '1.25rem', flexShrink: 0 }} />
            <span style={{ ...s.col, flex: '0 0 auto', minWidth: '10rem' }}>Project</span>
            <span style={{ ...s.col, flex: 1 }}>Repository</span>
            <span style={{ ...s.col, minWidth: '5rem' }}>Language</span>
            <span style={{ ...s.col, minWidth: '4rem' }}>WS</span>
            <span style={{ ...s.col, minWidth: '7rem', textAlign: 'right' }}>Last Used</span>
          </div>
          {filtered.length === 0 ? (
            <div style={s.emptyRow}>No projects match "{query}"</div>
          ) : (
            filtered.map(p => <ProjectTableRow key={p.id} project={p} />)
          )}
        </div>
        <p style={s.hint}>Click a row to expand its workspaces. Click again to collapse.</p>
      </main>
    </>
  )
}

// ---------------------------------------------------------------------------
// Mobile view (Variant A)
// ---------------------------------------------------------------------------

function ProjectCard({ project }: { project: UiProject }) {
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
    left: { display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 },
    name: { fontWeight: 600, fontSize: '1rem' },
    repo: { color: C.muted, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    right: { display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0, marginLeft: '0.75rem' },
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
      flexShrink: 0,
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
        <span style={s.repo}>{project.repoDisplay}</span>
      </div>
      <div style={s.right}>
        <span style={s.lastUsed}>Last used: {project.lastUsed}</span>
        <div style={s.chevron}>›</div>
      </div>
    </div>
  )
}

function MobileView({ onNewProject, projects }: { onNewProject: () => void; projects: UiProject[] }) {
  const s: Record<string, React.CSSProperties> = {
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0.75rem 1.25rem',
      background: C.surface,
      borderBottom: `1px solid ${C.border}`,
      flexShrink: 0,
    },
    logo: { fontWeight: 700, fontSize: '1.125rem', letterSpacing: '-0.01em' },
    headerRight: { display: 'flex', alignItems: 'center', gap: '0.625rem' },
    user: {
      padding: '0.25rem 0.5rem',
      borderRadius: '0.375rem',
      border: `1px solid ${C.border}`,
      fontSize: '0.8125rem',
      color: C.muted,
      cursor: 'default',
    },
    logoutBtn: {
      padding: '0.25rem 0.5rem',
      borderRadius: '0.375rem',
      border: `1px solid ${C.border}`,
      background: 'transparent',
      color: C.muted,
      fontSize: '0.8125rem',
      cursor: 'pointer',
    },
    content: { flex: 1, padding: '1.5rem 1rem', width: '100%', boxSizing: 'border-box' },
    sectionRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '1rem',
    },
    heading: { fontSize: '1.25rem', fontWeight: 600, margin: 0 },
    divider: { borderColor: C.border, margin: '0.5rem 0 1.25rem' },
    newBtn: {
      padding: '0.5rem 0.875rem',
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
      <header style={s.header}>
        <span style={s.logo}>Dev Console</span>
        <div style={s.headerRight}>
          <span style={s.user}>@alice ▾</span>
          <button style={s.logoutBtn}>Logout</button>
        </div>
      </header>
      <main style={s.content}>
        <div style={s.sectionRow}>
          <h2 style={s.heading}>Projects</h2>
          <button style={s.newBtn} onClick={onNewProject}>+ New Project</button>
        </div>
        <hr style={s.divider} />
        {projects.map(p => <ProjectCard key={p.id} project={p} />)}
      </main>
    </>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProjectsPage() {
  const isDesktop = useIsDesktop()
  const [showDialog, setShowDialog] = useState(false)
  const [projects, setProjects] = useState<UiProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function fetchProjects() {
    setLoading(true)
    setError(null)
    fetch('/api/projects')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<ApiProject[]>
      })
      .then(data => setProjects(data.map(toUiProject)))
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchProjects()
  }, [])

  const s: Record<string, React.CSSProperties> = {
    statusRow: {
      padding: '2rem',
      textAlign: 'center',
      color: C.muted,
      fontSize: '0.9375rem',
    },
    errorRow: {
      padding: '2rem',
      textAlign: 'center',
      color: '#f87171',
      fontSize: '0.9375rem',
    },
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: C.bg, color: C.text }}>
      {loading && <div style={s.statusRow}>Loading…</div>}
      {!loading && error && <div style={s.errorRow}>{error}</div>}
      {!loading && !error && (
        isDesktop
          ? <DesktopView onNewProject={() => setShowDialog(true)} projects={projects} />
          : <MobileView onNewProject={() => setShowDialog(true)} projects={projects} />
      )}
      {showDialog && (
        <AddProjectDialog
          onClose={() => setShowDialog(false)}
          onAdd={fetchProjects}
        />
      )}
    </div>
  )
}
