/**
 * Wireframe Variant B — Grid Tiles with Status Indicators
 *
 * A more visual alternative to the classic card list. Projects are displayed
 * in a responsive 2-column (desktop) / 1-column (mobile) grid. Each tile
 * features a coloured activity dot, workspace count badge, and a prominent
 * "Open" CTA. "+ New Project" lives in a sticky header bar. Variant also
 * shows the workspace selection (Screen 2b) in a slide-in side panel instead
 * of a separate page, giving a single-page "dashboard" feel.
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
    lastUsed: '2h ago',
    activity: 'active' as const,
    workspaces: [
      { id: 'main', name: 'main', branch: 'main', pr: null, lastUsed: '2h ago' },
      { id: 'feature-auth', name: 'feature-auth', branch: 'feature/auth', pr: '#42: Add JWT authentication', lastUsed: '1d ago' },
      { id: 'fix-logging', name: 'fix-logging', branch: 'fix/logging', pr: '#45: Fix structured logging', lastUsed: '4d ago' },
    ],
  },
  {
    id: 'backend-api',
    name: 'backend-api',
    repo: 'myorg/backend-api',
    language: 'Go',
    lastUsed: '1d ago',
    activity: 'idle' as const,
    workspaces: [
      { id: 'main', name: 'main', branch: 'main', pr: null, lastUsed: '1d ago' },
    ],
  },
  {
    id: 'frontend-app',
    name: 'frontend-app',
    repo: 'myorg/frontend-app',
    language: 'TypeScript',
    lastUsed: '3d ago',
    activity: 'idle' as const,
    workspaces: [
      { id: 'main', name: 'main', branch: 'main', pr: null, lastUsed: '3d ago' },
      { id: 'feat-dark', name: 'feat-dark', branch: 'feat/dark-mode', pr: '#31: Dark mode', lastUsed: '3d ago' },
    ],
  },
  {
    id: 'docs',
    name: 'docs',
    repo: 'myorg/docs',
    language: 'Markdown',
    lastUsed: '1w ago',
    activity: 'idle' as const,
    workspaces: [
      { id: 'main', name: 'main', branch: 'main', pr: null, lastUsed: '1w ago' },
    ],
  },
]

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
  green: '#22c55e',
  amber: '#f59e0b',
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
      position: 'sticky',
      top: 0,
      zIndex: 10,
    },
    logo: { fontWeight: 700, fontSize: '1.125rem' },
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
      <span style={s.logo}>Dev Console</span>
      <div style={s.right}>
        <button style={s.newBtn} onClick={onNewProject}>+ New Project</button>
        <span style={s.user}>@alice ▾</span>
        <button style={s.logoutBtn}>Logout</button>
      </div>
    </header>
  )
}

function ActivityDot({ status }: { status: 'active' | 'idle' }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: '0.625rem',
        height: '0.625rem',
        borderRadius: '50%',
        background: status === 'active' ? C.green : C.muted,
        flexShrink: 0,
      }}
      title={status === 'active' ? 'Active session' : 'Idle'}
    />
  )
}

function LangBadge({ lang }: { lang: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        padding: '0.125rem 0.5rem',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: 500,
        background: `${LANG_COLORS[lang] ?? C.muted}22`,
        color: LANG_COLORS[lang] ?? C.muted,
        border: `1px solid ${LANG_COLORS[lang] ?? C.muted}44`,
      }}
    >
      {lang}
    </span>
  )
}

function ProjectTile({
  project,
  onSelect,
}: {
  project: typeof PROJECTS[0]
  onSelect: (p: typeof PROJECTS[0]) => void
}) {
  const [hover, setHover] = useState(false)
  const s: Record<string, React.CSSProperties> = {
    tile: {
      display: 'flex',
      flexDirection: 'column',
      padding: '1.25rem',
      background: hover ? C.surfaceHover : C.surface,
      border: `1px solid ${hover ? '#4a6080' : C.border}`,
      borderRadius: '0.75rem',
      cursor: 'pointer',
      transition: 'background 0.15s, border-color 0.15s',
    },
    topRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.75rem' },
    nameRow: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
    name: { fontWeight: 700, fontSize: '1rem' },
    repo: { color: C.muted, fontSize: '0.8125rem', marginBottom: '0.875rem' },
    bottomRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' },
    meta: { color: C.muted, fontSize: '0.8125rem' },
    openBtn: {
      padding: '0.375rem 0.875rem',
      borderRadius: '0.375rem',
      border: `1px solid ${C.border}`,
      background: 'transparent',
      color: C.text,
      fontSize: '0.8125rem',
      fontWeight: 600,
      cursor: 'pointer',
    },
    wsBadge: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.25rem',
      padding: '0.125rem 0.5rem',
      borderRadius: '9999px',
      fontSize: '0.75rem',
      background: '#1e3a5f',
      color: '#93c5fd',
      border: '1px solid #2563eb44',
    },
  }
  return (
    <div
      style={s.tile}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => onSelect(project)}
      role="button"
      tabIndex={0}
      aria-label={`Open project ${project.name}`}
      onKeyDown={activateOnKeyboard}
    >
      <div style={s.topRow}>
        <div>
          <div style={s.nameRow}>
            <ActivityDot status={project.activity} />
            <span style={s.name}>{project.name}</span>
          </div>
        </div>
        <LangBadge lang={project.language} />
      </div>
      <div style={s.repo}>github.com/{project.repo}</div>
      <div style={s.bottomRow}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={s.meta}>Last used {project.lastUsed}</span>
          <span style={s.wsBadge}>⎇ {project.workspaces.length} workspaces</span>
        </div>
        <button style={s.openBtn} onClick={e => { e.stopPropagation(); onSelect(project) }}>
          Open ›
        </button>
      </div>
    </div>
  )
}

function WorkspacePanel({
  project,
  onClose,
}: {
  project: typeof PROJECTS[0]
  onClose: () => void
}) {
  const [wsHover, setWsHover] = useState<string | null>(null)

  function wsCardStyle(hov: boolean): React.CSSProperties {
    return {
      display: 'flex',
      flexDirection: 'column',
      gap: '0.375rem',
      padding: '0.875rem 1rem',
      background: hov ? C.surfaceHover : C.bg,
      border: `1px solid ${C.border}`,
      borderRadius: '0.5rem',
      cursor: 'pointer',
      transition: 'background 0.15s',
    }
  }

  const s: Record<string, React.CSSProperties> = {
    overlay: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      zIndex: 40,
      display: 'flex',
      justifyContent: 'flex-end',
    },
    panel: {
      width: '100%',
      maxWidth: '26rem',
      background: C.surface,
      borderLeft: `1px solid ${C.border}`,
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflowY: 'auto',
    },
    panelHeader: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '1rem 1.25rem',
      borderBottom: `1px solid ${C.border}`,
      position: 'sticky',
      top: 0,
      background: C.surface,
    },
    backBtn: {
      background: 'transparent',
      border: 'none',
      color: C.muted,
      fontSize: '1.25rem',
      cursor: 'pointer',
    },
    panelTitle: { fontWeight: 700, fontSize: '1rem' },
    newWsBtn: {
      padding: '0.375rem 0.75rem',
      borderRadius: '0.375rem',
      border: 'none',
      background: C.blue,
      color: 'white',
      fontSize: '0.8125rem',
      fontWeight: 600,
      cursor: 'pointer',
    },
    list: { padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' },
    wsName: { fontWeight: 600, fontSize: '0.9375rem' },
    wsBranch: { color: C.muted, fontSize: '0.8125rem', fontFamily: 'monospace' },
    wsPR: { color: '#93c5fd', fontSize: '0.8125rem' },
    wsFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' },
    wsLastUsed: { color: C.muted, fontSize: '0.75rem' },
    wsOpenBtn: {
      padding: '0.25rem 0.625rem',
      borderRadius: '0.25rem',
      border: `1px solid ${C.border}`,
      background: 'transparent',
      color: C.text,
      fontSize: '0.75rem',
      cursor: 'pointer',
    },
  }
  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.panel} onClick={e => e.stopPropagation()}>
        <div style={s.panelHeader}>
          <button style={s.backBtn} onClick={onClose} aria-label="Close panel">‹</button>
          <span style={s.panelTitle}>Workspaces — {project.name}</span>
          <button style={s.newWsBtn}>+ New</button>
        </div>
        <div style={s.list}>
          {project.workspaces.map(ws => (
            <div
              key={ws.id}
              style={wsCardStyle(wsHover === ws.id)}
              onMouseEnter={() => setWsHover(ws.id)}
              onMouseLeave={() => setWsHover(null)}
            >
              <span style={s.wsName}>{ws.name}</span>
              <span style={s.wsBranch}>⎇ {ws.branch}</span>
              {ws.pr
                ? <span style={s.wsPR}>PR {ws.pr}</span>
                : <span style={{ ...s.wsPR, color: C.muted }}>No PR</span>}
              <div style={s.wsFooter}>
                <span style={s.wsLastUsed}>Last used {ws.lastUsed}</span>
                <button style={s.wsOpenBtn}>Open ›</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function VariantB() {
  const [selected, setSelected] = useState<typeof PROJECTS[0] | null>(null)
  const [showNew, setShowNew] = useState(false)

  const s: Record<string, React.CSSProperties> = {
    page: { display: 'flex', flexDirection: 'column', minHeight: '100vh', background: C.bg },
    content: {
      flex: 1,
      padding: '2rem 1.5rem',
      maxWidth: '64rem',
      margin: '0 auto',
      width: '100%',
    },
    sectionHeading: {
      fontSize: '1.5rem',
      fontWeight: 700,
      marginBottom: '0.375rem',
    },
    sectionSub: {
      color: C.muted,
      fontSize: '0.875rem',
      marginBottom: '1.5rem',
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      gap: '1rem',
    },
    emptyHint: {
      padding: '2rem',
      textAlign: 'center',
      color: C.muted,
      border: `1px dashed ${C.border}`,
      borderRadius: '0.75rem',
    },
    newNotice: {
      padding: '1rem 1.25rem',
      background: '#1e3a5f',
      border: '1px solid #2563eb55',
      borderRadius: '0.5rem',
      marginBottom: '1.5rem',
      color: '#93c5fd',
      fontSize: '0.875rem',
    },
  }

  return (
    <div style={s.page}>
      <Header onNewProject={() => setShowNew(true)} />
      <main style={s.content}>
        {showNew && (
          <div style={s.newNotice}>
            ℹ️ Repository picker dialog would open here. (Variant B shows the same dialog as Variant A.)
            <button
              onClick={() => setShowNew(false)}
              style={{ marginLeft: '0.75rem', background: 'transparent', border: 'none', color: '#93c5fd', cursor: 'pointer', fontSize: '0.875rem' }}
            >
              Dismiss
            </button>
          </div>
        )}
        <h1 style={s.sectionHeading}>Your Projects</h1>
        <p style={s.sectionSub}>Select a project to view its workspaces.</p>
        <div style={s.grid}>
          {PROJECTS.map(p => (
            <ProjectTile key={p.id} project={p} onSelect={setSelected} />
          ))}
          <div
            style={{
              ...s.emptyHint,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '10rem',
              cursor: 'pointer',
            }}
            onClick={() => setShowNew(true)}
            role="button"
            tabIndex={0}
            aria-label="Add new project"
            onKeyDown={activateOnKeyboard}
          >
            <span style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>＋</span>
            <span>Add a project</span>
          </div>
        </div>
      </main>
      {selected && <WorkspacePanel project={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
