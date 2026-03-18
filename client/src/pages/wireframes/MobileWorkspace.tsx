/**
 * Wireframe: Mobile Workspace
 *
 * Interactive mockup of the mobile workspace view (< 768 px). Replaces the
 * desktop split-pane layout with a four-tab bottom-navigation approach:
 *
 *   💬 Agent   — full-screen agent-chat panel with session picker
 *   📁 Files   — file tree that drills into a full-screen file viewer
 *   ≈  Changes — list of pending agent-proposed diffs with Accept/Reject
 *   >_ Terminal — full-screen embedded terminal
 *
 * A hamburger icon (≡) in the top bar opens a slide-in drawer with workspace
 * navigation, session list, and a "+ New session" action.
 *
 * This mockup is intentionally constrained to 390 px wide so it renders
 * identically at desktop and mobile viewport widths.
 */

import { useState } from 'react'

// ---------------------------------------------------------------------------
// Colour tokens (shared dark theme)
// ---------------------------------------------------------------------------

const C = {
  bg: '#0f172a',
  surface: '#1e293b',
  surfaceHover: '#263348',
  surfaceAlt: '#162036',
  border: '#334155',
  text: '#f1f5f9',
  muted: '#94a3b8',
  blue: '#2563eb',
  blueLight: '#93c5fd',
  green: '#22c55e',
  greenDim: '#14532d',
  red: '#ef4444',
  redDim: '#450a0a',
  amber: '#f59e0b',
  tabActive: '#1e3a5f',
}

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const SESSIONS = [
  { id: 's1', name: 'Refactor auth to JWT', status: 'active' as const },
  { id: 's2', name: 'Add unit tests', status: 'idle' as const },
  { id: 's3', name: 'Fix CI pipeline', status: 'idle' as const },
]

const MESSAGES = [
  { id: 'm1', role: 'user' as const, text: 'Refactor auth to use JWT instead of basic auth.' },
  {
    id: 'm2',
    role: 'assistant' as const,
    text: "Sure, I'll refactor the auth module to use JWT. Reading the current implementation first…",
  },
  { id: 'm3', role: 'tool' as const, tool: 'read_file', args: 'path: src/auth.go' },
  { id: 'm4', role: 'tool' as const, tool: 'read_file', args: 'path: internal/jwt.go' },
  {
    id: 'm5',
    role: 'assistant' as const,
    text: "I've proposed changes to src/auth.go and internal/jwt.go. Review the diffs in the Changes tab.",
  },
  { id: 'm6', role: 'change' as const, file: 'src/auth.go', status: 'pending' as const },
  { id: 'm7', role: 'change' as const, file: 'internal/jwt.go', status: 'pending' as const },
]

const FILE_TREE = [
  {
    name: 'src',
    type: 'dir' as const,
    children: [
      { name: 'auth.go', type: 'file' as const, pending: true },
      { name: 'main.go', type: 'file' as const, pending: false },
    ],
  },
  {
    name: 'internal',
    type: 'dir' as const,
    children: [
      { name: 'jwt.go', type: 'file' as const, pending: true },
      { name: 'util.go', type: 'file' as const, pending: false },
    ],
  },
  { name: 'go.mod', type: 'file' as const, pending: false },
  { name: 'README.md', type: 'file' as const, pending: false },
]

const PENDING_CHANGES = [
  {
    id: 'c1',
    file: 'src/auth.go',
    session: 'Refactor auth to JWT',
    status: 'pending' as const,
    additions: 8,
    deletions: 6,
  },
  {
    id: 'c2',
    file: 'internal/jwt.go',
    session: 'Refactor auth to JWT',
    status: 'pending' as const,
    additions: 24,
    deletions: 0,
  },
]

const FILE_CONTENT = `package auth

import (
    "net/http"

    "github.com/golang-jwt/jwt"
)

func JWTAuth(r *http.Request) bool {
    token, err := jwt.Parse(
        r.Header.Get("Authorization"),
    )
    return err == nil && token.Valid
}`

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
// Tab type
// ---------------------------------------------------------------------------

type Tab = 'agent' | 'files' | 'changes' | 'terminal'

// ---------------------------------------------------------------------------
// TopBar
// ---------------------------------------------------------------------------

function TopBar({
  onMenuOpen,
  activeSession,
}: {
  onMenuOpen: () => void
  activeSession: string
}) {
  const s: Record<string, React.CSSProperties> = {
    bar: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 1rem',
      height: '3rem',
      background: C.surface,
      borderBottom: `1px solid ${C.border}`,
      flexShrink: 0,
    },
    left: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
    back: {
      background: 'transparent',
      border: 'none',
      color: C.muted,
      fontSize: '1.125rem',
      cursor: 'pointer',
      padding: '0.25rem',
    },
    title: { fontWeight: 600, fontSize: '0.9375rem', color: C.text },
    right: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
    dot: {
      width: '0.5rem',
      height: '0.5rem',
      borderRadius: '50%',
      background: C.green,
      display: 'inline-block',
    },
    sessionName: { fontSize: '0.8125rem', color: C.muted, maxWidth: '9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    avatar: {
      width: '1.75rem',
      height: '1.75rem',
      borderRadius: '50%',
      background: C.blue,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '0.75rem',
      fontWeight: 700,
      cursor: 'pointer',
    },
    menu: {
      background: 'transparent',
      border: 'none',
      color: C.text,
      fontSize: '1.25rem',
      cursor: 'pointer',
      padding: '0.25rem 0.375rem',
      lineHeight: 1,
    },
  }

  return (
    <header style={s.bar}>
      <div style={s.left}>
        <button style={s.back} aria-label="Back to workspace list">‹</button>
        <span style={s.title}>my-project</span>
      </div>
      <div style={s.right}>
        <span style={s.dot} />
        <span style={s.sessionName}>{activeSession}</span>
        <div style={s.avatar} aria-label="User menu">A</div>
        <button
          style={s.menu}
          aria-label="Open navigation drawer"
          onClick={onMenuOpen}
          onKeyDown={activateOnKeyboard}
        >
          ≡
        </button>
      </div>
    </header>
  )
}

// ---------------------------------------------------------------------------
// BottomTabBar
// ---------------------------------------------------------------------------

interface TabDef {
  id: Tab
  icon: string
  label: string
  badge?: number
}

const TABS: TabDef[] = [
  { id: 'agent', icon: '💬', label: 'Agent' },
  { id: 'files', icon: '📁', label: 'Files' },
  { id: 'changes', icon: '≈', label: 'Changes', badge: 2 },
  { id: 'terminal', icon: '>_', label: 'Terminal' },
]

function BottomTabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const s: Record<string, React.CSSProperties> = {
    bar: {
      display: 'flex',
      borderTop: `1px solid ${C.border}`,
      background: C.surface,
      flexShrink: 0,
    },
    tab: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0.5rem 0.25rem 0.625rem',
      cursor: 'pointer',
      background: 'transparent',
      border: 'none',
      gap: '0.125rem',
      position: 'relative',
    },
    icon: { fontSize: '1.125rem', lineHeight: 1 },
    label: { fontSize: '0.6875rem', letterSpacing: '0.01em' },
    badge: {
      position: 'absolute',
      top: '0.375rem',
      right: 'calc(50% - 0.85rem)',
      background: C.amber,
      color: '#000',
      borderRadius: '0.625rem',
      fontSize: '0.625rem',
      fontWeight: 700,
      padding: '0 0.25rem',
      minWidth: '0.9rem',
      textAlign: 'center',
    },
    activeLine: {
      position: 'absolute',
      top: 0,
      left: '15%',
      right: '15%',
      height: '2px',
      background: C.blue,
      borderRadius: '0 0 2px 2px',
    },
  }

  return (
    <nav style={s.bar} aria-label="Workspace panels">
      {TABS.map(t => (
        <button
          key={t.id}
          style={{
            ...s.tab,
            color: active === t.id ? C.blueLight : C.muted,
          }}
          onClick={() => onChange(t.id)}
          onKeyDown={activateOnKeyboard}
          aria-selected={active === t.id}
          aria-label={t.label}
          role="tab"
        >
          {active === t.id && <span style={s.activeLine} />}
          <span style={s.icon}>{t.icon}</span>
          <span style={s.label}>{t.label}</span>
          {t.badge !== undefined && <span style={s.badge}>{t.badge}</span>}
        </button>
      ))}
    </nav>
  )
}

// ---------------------------------------------------------------------------
// AgentPanel
// ---------------------------------------------------------------------------

function AgentPanel({ sessionId }: { sessionId: string }) {
  const [input, setInput] = useState('')
  const session = SESSIONS.find(s => s.id === sessionId) ?? SESSIONS[0]

  const s: Record<string, React.CSSProperties> = {
    panel: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    },
    sessionHeader: {
      padding: '0.5rem 1rem',
      borderBottom: `1px solid ${C.border}`,
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      background: C.surfaceAlt,
      flexShrink: 0,
    },
    sessionDot: {
      width: '0.5rem',
      height: '0.5rem',
      borderRadius: '50%',
      background: session.status === 'active' ? C.green : C.muted,
      flexShrink: 0,
    },
    sessionName: { fontSize: '0.8125rem', fontWeight: 600, color: C.text },
    sessionStatus: { fontSize: '0.75rem', color: C.muted, marginLeft: 'auto' },
    messages: {
      flex: 1,
      overflowY: 'auto',
      padding: '1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem',
    },
    userMsg: {
      alignSelf: 'flex-end',
      background: C.blue,
      color: '#fff',
      padding: '0.625rem 0.875rem',
      borderRadius: '1rem 1rem 0.25rem 1rem',
      fontSize: '0.875rem',
      maxWidth: '80%',
    },
    assistantBubble: {
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: '0.5rem',
      padding: '0.75rem',
      fontSize: '0.875rem',
      color: C.text,
      maxWidth: '88%',
    },
    roleLabel: { fontSize: '0.75rem', color: C.muted, marginBottom: '0.25rem' },
    toolBubble: {
      background: C.surfaceAlt,
      border: `1px solid ${C.border}`,
      borderRadius: '0.5rem',
      padding: '0.5rem 0.75rem',
      fontSize: '0.8125rem',
      fontFamily: 'monospace',
      color: C.muted,
      maxWidth: '88%',
    },
    toolHeader: { fontSize: '0.75rem', color: C.blueLight, marginBottom: '0.25rem', fontFamily: 'sans-serif' },
    changeBubble: {
      background: C.surfaceAlt,
      border: `1px solid ${C.amber}`,
      borderRadius: '0.5rem',
      padding: '0.625rem 0.75rem',
      fontSize: '0.875rem',
      maxWidth: '88%',
    },
    changeHeader: { fontSize: '0.75rem', color: C.amber, marginBottom: '0.375rem' },
    changeFile: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' },
    changeFilename: { fontSize: '0.8125rem', fontFamily: 'monospace', color: C.text },
    pendingBadge: {
      fontSize: '0.6875rem',
      background: C.amber,
      color: '#000',
      borderRadius: '0.25rem',
      padding: '0.0625rem 0.3rem',
      fontWeight: 600,
    },
    changeActions: { display: 'flex', gap: '0.5rem' },
    acceptBtn: {
      flex: 1,
      padding: '0.375rem',
      border: 'none',
      borderRadius: '0.375rem',
      background: C.greenDim,
      color: C.green,
      fontSize: '0.8125rem',
      fontWeight: 600,
      cursor: 'pointer',
    },
    rejectBtn: {
      flex: 1,
      padding: '0.375rem',
      border: 'none',
      borderRadius: '0.375rem',
      background: C.redDim,
      color: C.red,
      fontSize: '0.8125rem',
      fontWeight: 600,
      cursor: 'pointer',
    },
    inputArea: {
      display: 'flex',
      gap: '0.5rem',
      padding: '0.75rem 1rem',
      borderTop: `1px solid ${C.border}`,
      background: C.surface,
      flexShrink: 0,
    },
    input: {
      flex: 1,
      padding: '0.625rem 0.875rem',
      borderRadius: '1.5rem',
      border: `1px solid ${C.border}`,
      background: C.bg,
      color: C.text,
      fontSize: '0.875rem',
      outline: 'none',
    },
    sendBtn: {
      width: '2.5rem',
      height: '2.5rem',
      borderRadius: '50%',
      border: 'none',
      background: C.blue,
      color: '#fff',
      fontSize: '1rem',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    typingIndicator: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.375rem',
      color: C.muted,
      fontSize: '0.8125rem',
      padding: '0.25rem 0',
    },
    dot1: { width: '0.375rem', height: '0.375rem', borderRadius: '50%', background: C.muted },
  }

  return (
    <div style={s.panel}>
      {/* Session header strip */}
      <div style={s.sessionHeader}>
        <span style={s.sessionDot} />
        <span style={s.sessionName}>{session.name}</span>
        <span style={s.sessionStatus}>{session.status === 'active' ? 'Agent working…' : 'Idle'}</span>
      </div>

      {/* Message feed */}
      <div style={s.messages} role="log" aria-label="Agent conversation">
        {MESSAGES.map(msg => {
          if (msg.role === 'user') {
            return (
              <div key={msg.id} style={{ alignSelf: 'flex-end' }}>
                <div style={s.userMsg}>{msg.text}</div>
              </div>
            )
          }
          if (msg.role === 'assistant') {
            return (
              <div key={msg.id}>
                <div style={s.roleLabel}>assistant</div>
                <div style={s.assistantBubble}>{msg.text}</div>
              </div>
            )
          }
          if (msg.role === 'tool') {
            return (
              <div key={msg.id}>
                <div style={s.toolBubble}>
                  <div style={s.toolHeader}>tool · {msg.tool}</div>
                  {msg.args}
                </div>
              </div>
            )
          }
          if (msg.role === 'change') {
            return (
              <div key={msg.id}>
                <div style={s.changeBubble}>
                  <div style={s.changeHeader}>change proposed 🔴</div>
                  <div style={s.changeFile}>
                    <span style={s.changeFilename}>{msg.file}</span>
                    <span style={s.pendingBadge}>pending</span>
                  </div>
                  <div style={s.changeActions}>
                    <button style={s.acceptBtn} aria-label={`Accept change to ${msg.file}`}>Accept</button>
                    <button style={s.rejectBtn} aria-label={`Reject change to ${msg.file}`}>Reject</button>
                  </div>
                </div>
              </div>
            )
          }
          return null
        })}

        {/* Typing indicator for active session */}
        {session.status === 'active' && (
          <div style={s.typingIndicator}>
            <span style={s.dot1} />
            <span style={s.dot1} />
            <span style={s.dot1} />
            <span>Agent is working…</span>
          </div>
        )}
      </div>

      {/* Input area */}
      <div style={s.inputArea}>
        <input
          style={s.input}
          type="text"
          placeholder="Type a message…"
          value={input}
          onChange={e => setInput(e.target.value)}
          aria-label="Message input"
        />
        <button style={s.sendBtn} aria-label="Send message">↑</button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// FilesPanel
// ---------------------------------------------------------------------------

function FilesPanel() {
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set(['src', 'internal']))

  const s: Record<string, React.CSSProperties> = {
    panel: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
    header: {
      padding: '0.5rem 1rem',
      borderBottom: `1px solid ${C.border}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexShrink: 0,
    },
    breadcrumb: { fontSize: '0.8125rem', color: C.muted, display: 'flex', alignItems: 'center', gap: '0.25rem' },
    backBtn: {
      background: 'transparent',
      border: 'none',
      color: C.blueLight,
      fontSize: '0.875rem',
      cursor: 'pointer',
      padding: 0,
    },
    tree: { flex: 1, overflowY: 'auto', padding: '0.5rem 0' },
    dirRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      padding: '0.5rem 1rem',
      cursor: 'pointer',
      fontSize: '0.875rem',
      color: C.text,
      userSelect: 'none',
    },
    fileRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      padding: '0.5rem 1rem 0.5rem 2.25rem',
      cursor: 'pointer',
      fontSize: '0.875rem',
      color: C.text,
    },
    fileIcon: { fontSize: '0.875rem' },
    pendingDot: {
      width: '0.5rem',
      height: '0.5rem',
      borderRadius: '50%',
      background: C.amber,
      marginLeft: 'auto',
      flexShrink: 0,
    },
    viewer: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
    viewerHeader: {
      padding: '0.5rem 1rem',
      borderBottom: `1px solid ${C.border}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexShrink: 0,
    },
    filename: { fontSize: '0.875rem', fontFamily: 'monospace', color: C.text },
    editBtn: {
      padding: '0.25rem 0.625rem',
      borderRadius: '0.375rem',
      border: `1px solid ${C.border}`,
      background: 'transparent',
      color: C.muted,
      fontSize: '0.8125rem',
      cursor: 'pointer',
    },
    code: {
      flex: 1,
      overflowY: 'auto',
      padding: '0.75rem 1rem',
      fontFamily: 'monospace',
      fontSize: '0.8125rem',
      lineHeight: 1.7,
      color: C.text,
      background: C.bg,
      whiteSpace: 'pre',
    },
  }

  function toggleDir(name: string) {
    setExpandedDirs(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  if (selectedFile !== null) {
    return (
      <div style={s.viewer}>
        <div style={s.viewerHeader}>
          <div style={s.breadcrumb}>
            <button style={s.backBtn} onClick={() => setSelectedFile(null)} aria-label="Back to file tree">‹ Files</button>
            <span>/</span>
            <span style={{ color: C.text }}>{selectedFile}</span>
          </div>
          <button style={s.editBtn}>Edit</button>
        </div>
        <div style={s.code} role="region" aria-label={`Contents of ${selectedFile}`}>
          {FILE_CONTENT}
        </div>
      </div>
    )
  }

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: C.muted, letterSpacing: '0.05em' }}>FILES</span>
        <span style={{ fontSize: '0.75rem', color: C.muted }}>my-project</span>
      </div>
      <div style={s.tree} role="tree" aria-label="File tree">
        {FILE_TREE.map(item => {
          if (item.type === 'dir') {
            const expanded = expandedDirs.has(item.name)
            return (
              <div key={item.name}>
                <div
                  style={s.dirRow}
                  onClick={() => toggleDir(item.name)}
                  onKeyDown={activateOnKeyboard}
                  role="treeitem"
                  aria-expanded={expanded}
                  tabIndex={0}
                >
                  <span>{expanded ? '▾' : '▸'}</span>
                  <span>📁</span>
                  <span>{item.name}/</span>
                </div>
                {expanded && item.children?.map(child => (
                  <div
                    key={child.name}
                    style={{
                      ...s.fileRow,
                      background: 'transparent',
                    }}
                    onClick={() => setSelectedFile(child.name)}
                    onKeyDown={activateOnKeyboard}
                    role="treeitem"
                    tabIndex={0}
                    aria-label={`${child.name}${child.pending ? ' — pending change' : ''}`}
                  >
                    <span style={s.fileIcon}>📄</span>
                    <span>{child.name}</span>
                    {child.pending && <span style={s.pendingDot} aria-label="Pending change" />}
                  </div>
                ))}
              </div>
            )
          }
          return (
            <div
              key={item.name}
              style={s.fileRow}
              onClick={() => setSelectedFile(item.name)}
              onKeyDown={activateOnKeyboard}
              role="treeitem"
              tabIndex={0}
            >
              <span style={s.fileIcon}>📄</span>
              <span>{item.name}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ChangesPanel
// ---------------------------------------------------------------------------

function ChangesPanel() {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [accepted, setAccepted] = useState<Set<string>>(new Set())
  const [rejected, setRejected] = useState<Set<string>>(new Set())

  const pending = PENDING_CHANGES.filter(c => !accepted.has(c.id) && !rejected.has(c.id))
  const done = PENDING_CHANGES.filter(c => accepted.has(c.id) || rejected.has(c.id))

  const s: Record<string, React.CSSProperties> = {
    panel: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
    header: {
      padding: '0.5rem 1rem',
      borderBottom: `1px solid ${C.border}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexShrink: 0,
    },
    list: { flex: 1, overflowY: 'auto', padding: '0.75rem' },
    sectionLabel: {
      fontSize: '0.75rem',
      color: C.muted,
      letterSpacing: '0.05em',
      fontWeight: 600,
      marginBottom: '0.5rem',
      marginTop: '0.75rem',
    },
    card: {
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: '0.5rem',
      marginBottom: '0.625rem',
      overflow: 'hidden',
    },
    cardHeader: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0.625rem 0.875rem',
      cursor: 'pointer',
    },
    cardLeft: { display: 'flex', flexDirection: 'column', gap: '0.125rem' },
    filename: { fontSize: '0.875rem', fontFamily: 'monospace', fontWeight: 600, color: C.text },
    meta: { fontSize: '0.75rem', color: C.muted },
    stats: { display: 'flex', gap: '0.5rem', alignItems: 'center' },
    additions: { fontSize: '0.75rem', color: C.green, fontWeight: 600 },
    deletions: { fontSize: '0.75rem', color: C.red, fontWeight: 600 },
    chevron: { color: C.muted, fontSize: '0.875rem' },
    actions: {
      display: 'flex',
      gap: '0.5rem',
      padding: '0 0.875rem 0.75rem',
    },
    acceptBtn: {
      flex: 1,
      padding: '0.5rem',
      border: 'none',
      borderRadius: '0.375rem',
      background: C.greenDim,
      color: C.green,
      fontSize: '0.8125rem',
      fontWeight: 600,
      cursor: 'pointer',
    },
    rejectBtn: {
      flex: 1,
      padding: '0.5rem',
      border: 'none',
      borderRadius: '0.375rem',
      background: C.redDim,
      color: C.red,
      fontSize: '0.8125rem',
      fontWeight: 600,
      cursor: 'pointer',
    },
    diffPreview: {
      background: C.bg,
      borderTop: `1px solid ${C.border}`,
      padding: '0.625rem 0.875rem',
      fontFamily: 'monospace',
      fontSize: '0.75rem',
      lineHeight: 1.6,
    },
    diffAdded: { color: C.green },
    diffRemoved: { color: C.red },
    diffContext: { color: C.muted },
    emptyState: {
      padding: '2rem 1rem',
      textAlign: 'center',
      color: C.muted,
      fontSize: '0.875rem',
    },
    doneCard: {
      background: C.surfaceAlt,
      border: `1px solid ${C.border}`,
      borderRadius: '0.5rem',
      padding: '0.625rem 0.875rem',
      marginBottom: '0.625rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    doneFilename: { fontSize: '0.875rem', fontFamily: 'monospace', color: C.muted },
    doneStatus: { fontSize: '0.75rem', fontWeight: 600 },
  }

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: C.muted, letterSpacing: '0.05em' }}>PROPOSED CHANGES</span>
        {pending.length > 0 && (
          <span style={{ fontSize: '0.75rem', background: C.amber, color: '#000', borderRadius: '0.625rem', padding: '0.125rem 0.5rem', fontWeight: 600 }}>
            {pending.length} pending
          </span>
        )}
      </div>

      <div style={s.list} role="list" aria-label="Proposed changes">
        {pending.length === 0 && done.length === 0 && (
          <div style={s.emptyState}>No proposed changes</div>
        )}

        {pending.length > 0 && (
          <>
            <div style={s.sectionLabel}>PENDING REVIEW</div>
            {pending.map(c => (
              <div key={c.id} style={s.card} role="listitem">
                <div
                  style={s.cardHeader}
                  onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                  onKeyDown={activateOnKeyboard}
                  role="button"
                  tabIndex={0}
                  aria-expanded={expanded === c.id}
                  aria-label={`Toggle diff for ${c.file}`}
                >
                  <div style={s.cardLeft}>
                    <span style={s.filename}>{c.file}</span>
                    <span style={s.meta}>{c.session}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={s.stats}>
                      <span style={s.additions}>+{c.additions}</span>
                      <span style={s.deletions}>−{c.deletions}</span>
                    </div>
                    <span style={s.chevron}>{expanded === c.id ? '▾' : '›'}</span>
                  </div>
                </div>

                {expanded === c.id && (
                  <div style={s.diffPreview} aria-label={`Diff for ${c.file}`}>
                    <div style={s.diffRemoved}>- func BasicAuth(r *http.Request) bool {'{'}</div>
                    <div style={s.diffRemoved}>-     _, _, ok := r.BasicAuth()</div>
                    <div style={s.diffRemoved}>-     return ok</div>
                    <div style={s.diffRemoved}>- {'}'}</div>
                    <div style={s.diffAdded}>+ func JWTAuth(r *http.Request) bool {'{'}</div>
                    <div style={s.diffAdded}>+     token, err := jwt.Parse(</div>
                    <div style={s.diffAdded}>+         r.Header.Get("Authorization"),</div>
                    <div style={s.diffAdded}>+     )</div>
                    <div style={s.diffAdded}>+     return err == nil && token.Valid</div>
                    <div style={s.diffAdded}>+ {'}'}</div>
                  </div>
                )}

                <div style={s.actions}>
                  <button
                    style={s.acceptBtn}
                    onClick={() => setAccepted(prev => new Set([...prev, c.id]))}
                    aria-label={`Accept change to ${c.file}`}
                  >
                    ✓ Accept
                  </button>
                  <button
                    style={s.rejectBtn}
                    onClick={() => setRejected(prev => new Set([...prev, c.id]))}
                    aria-label={`Reject change to ${c.file}`}
                  >
                    ✕ Reject
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {done.length > 0 && (
          <>
            <div style={s.sectionLabel}>REVIEWED</div>
            {done.map(c => (
              <div key={c.id} style={s.doneCard} role="listitem">
                <span style={s.doneFilename}>{c.file}</span>
                <span style={{
                  ...s.doneStatus,
                  color: accepted.has(c.id) ? C.green : C.red,
                }}>
                  {accepted.has(c.id) ? '✓ Accepted' : '✕ Rejected'}
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TerminalPanel
// ---------------------------------------------------------------------------

function TerminalPanel() {
  const s: Record<string, React.CSSProperties> = {
    panel: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
    header: {
      padding: '0.5rem 1rem',
      borderBottom: `1px solid ${C.border}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexShrink: 0,
    },
    screen: {
      flex: 1,
      background: '#000',
      padding: '0.75rem 0.875rem',
      fontFamily: 'monospace',
      fontSize: '0.8125rem',
      lineHeight: 1.5,
      color: '#d4d4d4',
      overflowY: 'auto',
    },
    prompt: { color: C.green },
    output: { color: '#d4d4d4' },
    cursor: {
      display: 'inline-block',
      width: '0.5rem',
      height: '1rem',
      background: '#d4d4d4',
      verticalAlign: 'text-bottom',
      animation: 'blink 1s step-end infinite',
    },
    note: {
      padding: '0.5rem 1rem',
      borderTop: `1px solid ${C.border}`,
      fontSize: '0.75rem',
      color: C.muted,
      background: C.surface,
      flexShrink: 0,
    },
  }

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: C.muted, letterSpacing: '0.05em' }}>TERMINAL</span>
        <span style={{ fontSize: '0.75rem', color: C.muted }}>bash — my-project</span>
      </div>

      <div style={s.screen} role="region" aria-label="Terminal output">
        <div>
          <span style={s.prompt}>alice@dev-console</span>
          <span style={{ color: C.blueLight }}>:~/my-project</span>
          <span style={s.prompt}>$ </span>
          <span>go test ./...</span>
        </div>
        <div style={s.output}>ok      github.com/myorg/my-project/auth    0.124s</div>
        <div style={s.output}>ok      github.com/myorg/my-project/internal 0.031s</div>
        <div style={{ ...s.output, color: C.green }}>All tests passed.</div>
        <div style={{ marginTop: '0.5rem' }}>
          <span style={s.prompt}>alice@dev-console</span>
          <span style={{ color: C.blueLight }}>:~/my-project</span>
          <span style={s.prompt}>$ </span>
          <span style={s.cursor} />
        </div>
      </div>

      <div style={s.note}>
        Full-screen terminal — no split view on mobile. Use the tabs to switch
        between Agent, Files, Changes, and Terminal.
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// NavigationDrawer
// ---------------------------------------------------------------------------

const WORKSPACES = [
  { id: 'main', name: 'main', branch: 'main' },
  { id: 'feature-auth', name: 'feature-auth', branch: 'feature/auth' },
]

function NavigationDrawer({
  onClose,
  activeSession,
  onSessionChange,
}: {
  onClose: () => void
  activeSession: string
  onSessionChange: (id: string) => void
}) {
  const s: Record<string, React.CSSProperties> = {
    overlay: {
      position: 'absolute',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      zIndex: 20,
      display: 'flex',
    },
    drawer: {
      width: '80%',
      maxWidth: '18rem',
      background: C.surface,
      borderRight: `1px solid ${C.border}`,
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto',
    },
    drawerHeader: {
      padding: '0.875rem 1rem',
      borderBottom: `1px solid ${C.border}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexShrink: 0,
    },
    drawerTitle: { fontWeight: 700, fontSize: '0.9375rem' },
    closeBtn: {
      background: 'transparent',
      border: 'none',
      color: C.muted,
      fontSize: '1.125rem',
      cursor: 'pointer',
    },
    section: { padding: '0.75rem 1rem' },
    sectionLabel: {
      fontSize: '0.6875rem',
      color: C.muted,
      letterSpacing: '0.08em',
      fontWeight: 700,
      marginBottom: '0.5rem',
      textTransform: 'uppercase' as const,
    },
    wsRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      padding: '0.5rem 0.625rem',
      borderRadius: '0.375rem',
      cursor: 'pointer',
      fontSize: '0.875rem',
    },
    wsBranch: { fontSize: '0.75rem', color: C.muted, fontFamily: 'monospace' },
    sessionRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      padding: '0.5rem 0.625rem',
      borderRadius: '0.375rem',
      cursor: 'pointer',
      fontSize: '0.875rem',
    },
    sessionDot: {
      width: '0.5rem',
      height: '0.5rem',
      borderRadius: '50%',
      flexShrink: 0,
    },
    newSessionBtn: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      padding: '0.5rem 0.625rem',
      borderRadius: '0.375rem',
      cursor: 'pointer',
      fontSize: '0.875rem',
      color: C.blueLight,
      background: 'transparent',
      border: 'none',
      width: '100%',
      textAlign: 'left' as const,
    },
    divider: { borderColor: C.border, margin: '0.25rem 0' },
  }

  const backdrop = { ...s.overlay, justifyContent: 'flex-start' }

  return (
    <div style={backdrop} onClick={onClose} role="dialog" aria-modal="true" aria-label="Navigation drawer">
      <div style={s.drawer} onClick={e => e.stopPropagation()}>
        <div style={s.drawerHeader}>
          <span style={s.drawerTitle}>my-project</span>
          <button style={s.closeBtn} onClick={onClose} aria-label="Close drawer">✕</button>
        </div>

        <div style={s.section}>
          <div style={s.sectionLabel}>Workspace</div>
          {WORKSPACES.map(ws => (
            <div key={ws.id} style={s.wsRow} role="button" tabIndex={0} onKeyDown={activateOnKeyboard}>
              <span>⎇</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.0625rem' }}>
                <span>{ws.name}</span>
                <span style={s.wsBranch}>{ws.branch}</span>
              </div>
            </div>
          ))}
        </div>

        <hr style={s.divider} />

        <div style={s.section}>
          <div style={s.sectionLabel}>Agent Sessions</div>
          {SESSIONS.map(sess => (
            <div
              key={sess.id}
              style={{
                ...s.sessionRow,
                background: sess.id === activeSession ? C.tabActive : 'transparent',
                color: sess.id === activeSession ? C.text : C.muted,
              }}
              onClick={() => { onSessionChange(sess.id); onClose() }}
              onKeyDown={activateOnKeyboard}
              role="button"
              tabIndex={0}
              aria-label={`Switch to session: ${sess.name}`}
              aria-pressed={sess.id === activeSession}
            >
              <span style={{ ...s.sessionDot, background: sess.status === 'active' ? C.green : C.muted }} />
              <span>{sess.name}</span>
            </div>
          ))}
          <button style={s.newSessionBtn} aria-label="Start a new agent session">
            + New session
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// MobileWorkspace (main component)
// ---------------------------------------------------------------------------

export default function MobileWorkspace() {
  const [activeTab, setActiveTab] = useState<Tab>('agent')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [activeSession, setActiveSession] = useState('s1')

  const currentSession = SESSIONS.find(s => s.id === activeSession) ?? SESSIONS[0]

  const s: Record<string, React.CSSProperties> = {
    // Outer wrapper constrains to a phone-width frame so the mockup
    // looks correct when viewed on a wide desktop monitor.
    outer: {
      minHeight: '100vh',
      background: '#020817',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      padding: '2rem 0',
    },
    phone: {
      width: '390px',
      height: '844px',
      background: C.bg,
      border: `1px solid ${C.border}`,
      borderRadius: '2rem',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
    },
    content: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  }

  return (
    <div style={s.outer}>
      <div style={s.phone}>
        <TopBar
          onMenuOpen={() => setDrawerOpen(true)}
          activeSession={currentSession.name}
        />

        <div style={s.content}>
          {activeTab === 'agent' && <AgentPanel sessionId={activeSession} />}
          {activeTab === 'files' && <FilesPanel />}
          {activeTab === 'changes' && <ChangesPanel />}
          {activeTab === 'terminal' && <TerminalPanel />}
        </div>

        <BottomTabBar active={activeTab} onChange={setActiveTab} />

        {drawerOpen && (
          <NavigationDrawer
            onClose={() => setDrawerOpen(false)}
            activeSession={activeSession}
            onSessionChange={setActiveSession}
          />
        )}
      </div>
    </div>
  )
}
