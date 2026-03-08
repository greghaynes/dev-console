/**
 * Wireframe Variant C — Compact Table with Search + Inline Workspace Expansion
 *
 * A data-dense, "developer dashboard" layout. Projects are shown as compact
 * rows in a bordered table-like list with a prominent search/filter input.
 * Clicking a row expands it in-place to reveal its workspaces (accordion
 * pattern), removing the need to navigate away. This variant favours
 * efficiency for users with many projects. A "+ New Project" FAB is pinned to
 * the bottom-right on mobile; on desktop it sits in the header.
 */

import { useState } from 'react'

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const PROJECTS = [
  {
    id: 'my-project',
    name: 'my-project',
    repo: 'myorg/my-project',
    language: 'Go',
    lastUsed: '2 hours ago',
    workspaces: [
      { id: 'main', branch: 'main', pr: null, lastUsed: '2h ago' },
      { id: 'feature-auth', branch: 'feature/auth', pr: '#42', lastUsed: '1d ago' },
      { id: 'fix-logs', branch: 'fix/logs', pr: '#45', lastUsed: '4d ago' },
    ],
  },
  {
    id: 'backend-api',
    name: 'backend-api',
    repo: 'myorg/backend-api',
    language: 'Go',
    lastUsed: '1 day ago',
    workspaces: [
      { id: 'main', branch: 'main', pr: null, lastUsed: '1d ago' },
    ],
  },
  {
    id: 'frontend-app',
    name: 'frontend-app',
    repo: 'myorg/frontend-app',
    language: 'TypeScript',
    lastUsed: '3 days ago',
    workspaces: [
      { id: 'main', branch: 'main', pr: null, lastUsed: '3d ago' },
      { id: 'feat-dark', branch: 'feat/dark-mode', pr: '#31', lastUsed: '3d ago' },
    ],
  },
  {
    id: 'docs',
    name: 'docs',
    repo: 'myorg/docs',
    language: 'Markdown',
    lastUsed: '1 week ago',
    workspaces: [
      { id: 'main', branch: 'main', pr: null, lastUsed: '1w ago' },
    ],
  },
]

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

const C = {
  bg: '#0f172a',
  surface: '#1e293b',
  surfaceAlt: '#172032',
  surfaceHover: '#263348',
  expanded: '#162036',
  border: '#334155',
  text: '#f1f5f9',
  muted: '#94a3b8',
  blue: '#2563eb',
  blueLight: '#93c5fd',
  green: '#22c55e',
}

const LANG_COLORS: Record<string, string> = {
  Go: '#00acd7',
  TypeScript: '#3178c6',
  Markdown: '#7c3aed',
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Header({ onNewProject }: { onNewProject: () => void }) {
  const s: Record<string, React.CSSProperties> = {
    bar: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0.75rem 1.5rem',
      background: C.surface,
      borderBottom: `1px solid ${C.border}`,
    },
    left: { display: 'flex', alignItems: 'center', gap: '1rem' },
    logo: { fontWeight: 700, fontSize: '1.125rem' },
    tag: {
      padding: '0.125rem 0.5rem',
      borderRadius: '0.25rem',
      background: '#1e3a5f',
      color: C.blueLight,
      fontSize: '0.75rem',
      fontWeight: 600,
    },
    right: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
    user: {
      padding: '0.25rem 0.625rem',
      borderRadius: '0.375rem',
      border: `1px solid ${C.border}`,
      fontSize: '0.875rem',
      color: C.muted,
    },
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
      <div style={s.left}>
        <span style={s.logo}>Dev Console</span>
        <span style={s.tag}>Projects</span>
      </div>
      <div style={s.right}>
        <button style={s.newBtn} onClick={onNewProject} aria-label="New project">+ New Project</button>
        <span style={s.user}>@alice ▾</span>
        <button style={s.logoutBtn}>Logout</button>
      </div>
    </header>
  )
}

function WorkspaceRow({ ws }: { ws: typeof PROJECTS[0]['workspaces'][0] }) {
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

function ProjectRow({ project }: { project: typeof PROJECTS[0] }) {
  const [expanded, setExpanded] = useState(false)
  const [hover, setHover] = useState(false)

  const rowBg = expanded ? C.expanded : hover ? C.surfaceHover : 'transparent'

  const s: Record<string, React.CSSProperties> = {
    wrapper: {
      borderBottom: `1px solid ${C.border}`,
    },
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
      >
        <span style={s.chevron}>›</span>
        <span style={s.name}>{project.name}</span>
        <span style={s.repo}>github.com/{project.repo}</span>
        <span style={s.langDot} />
        <span style={s.lang}>{project.language}</span>
        <span style={s.wsCount}>{project.workspaces.length} ws</span>
        <span style={s.lastUsed}>{project.lastUsed}</span>
      </div>
      {expanded && project.workspaces.map(ws => (
        <WorkspaceRow key={ws.id} ws={ws} />
      ))}
    </div>
  )
}

function TableHeader() {
  const s: Record<string, React.CSSProperties> = {
    row: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.875rem',
      padding: '0.5rem 1rem',
      borderBottom: `1px solid ${C.border}`,
      background: C.surface,
    },
    col: { fontSize: '0.75rem', fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' },
  }
  return (
    <div style={s.row}>
      <span style={{ ...s.col, width: '1.25rem', flexShrink: 0 }} />
      <span style={{ ...s.col, flex: '0 0 auto', minWidth: '10rem' }}>Project</span>
      <span style={{ ...s.col, flex: 1 }}>Repository</span>
      <span style={{ ...s.col, minWidth: '5rem' }}>Language</span>
      <span style={{ ...s.col, minWidth: '4rem' }}>WS</span>
      <span style={{ ...s.col, minWidth: '7rem', textAlign: 'right' }}>Last Used</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function VariantC() {
  const [query, setQuery] = useState('')
  const [showNew, setShowNew] = useState(false)

  const filtered = PROJECTS.filter(
    p =>
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.repo.toLowerCase().includes(query.toLowerCase()),
  )

  const s: Record<string, React.CSSProperties> = {
    page: { display: 'flex', flexDirection: 'column', minHeight: '100vh', background: C.bg },
    content: {
      flex: 1,
      padding: '2rem 1.5rem',
      maxWidth: '64rem',
      margin: '0 auto',
      width: '100%',
      boxSizing: 'border-box',
    },
    toolbar: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      marginBottom: '1rem',
    },
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
    table: {
      border: `1px solid ${C.border}`,
      borderRadius: '0.625rem',
      overflow: 'hidden',
    },
    emptyRow: {
      padding: '2.5rem',
      textAlign: 'center',
      color: C.muted,
    },
    newNotice: {
      padding: '1rem 1.25rem',
      background: '#1e3a5f',
      border: '1px solid #2563eb55',
      borderRadius: '0.5rem',
      marginBottom: '1rem',
      color: C.blueLight,
      fontSize: '0.875rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
  }

  return (
    <div style={s.page}>
      <Header onNewProject={() => setShowNew(true)} />
      <main style={s.content}>
        {showNew && (
          <div style={s.newNotice}>
            <span>ℹ️ Repository picker dialog would open here.</span>
            <button
              onClick={() => setShowNew(false)}
              style={{ background: 'transparent', border: 'none', color: C.blueLight, cursor: 'pointer', fontSize: '0.875rem' }}
            >
              ✕
            </button>
          </div>
        )}
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
          <TableHeader />
          {filtered.length === 0 ? (
            <div style={s.emptyRow}>No projects match "{query}"</div>
          ) : (
            filtered.map(p => <ProjectRow key={p.id} project={p} />)
          )}
        </div>
        <p style={{ color: C.muted, fontSize: '0.8125rem', marginTop: '0.75rem' }}>
          Click a row to expand its workspaces. Click again to collapse.
        </p>
      </main>
    </div>
  )
}
