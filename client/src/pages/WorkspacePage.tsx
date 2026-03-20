/**
 * WorkspacePage — responsive workspace view.
 *
 * Desktop (≥ 768 px): collapsible file-tree sidebar on the left; tabbed panel
 * on the right with four tabs: Agent, Files, Changes, Terminal.
 *
 * Mobile (< 768 px): full-screen single panel with a four-tab bottom nav bar
 * (Agent, Files, Changes, Terminal) and a slide-in navigation drawer accessed
 * via the ≡ icon in the top bar.
 *
 * Routes:
 *   /projects/:pid/workspaces/:wid
 */

import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import FileTree from '../components/FileTree'
import FileViewer from '../components/FileViewer'
import ChatPanel from '../components/ChatPanel'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

// ---------------------------------------------------------------------------
// Colour tokens
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
}

// ---------------------------------------------------------------------------
// Minimal socket-like interface (same pattern as TerminalPage)
// ---------------------------------------------------------------------------

interface SocketLike {
  binaryType: BinaryType
  readyState: number
  onopen: ((event: Event) => void) | null
  onmessage: ((event: MessageEvent) => void) | null
  onclose: ((event: CloseEvent) => void) | null
  onerror: ((event: Event) => void) | null
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void
  close(code?: number, reason?: string): void
}

function createDemoSocket(): SocketLike {
  const sock: SocketLike = {
    binaryType: 'arraybuffer',
    readyState: WebSocket.CONNECTING,
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    send(data) {
      if (sock.readyState !== WebSocket.OPEN) return
      if (typeof data === 'string') {
        try {
          const msg = JSON.parse(data) as { type?: string }
          if (msg.type === 'resize') return
        } catch { /* not JSON — echo */ }
        setTimeout(() => {
          sock.onmessage?.(new MessageEvent('message', { data }))
        }, 10)
      } else if (data instanceof ArrayBuffer) {
        setTimeout(() => {
          sock.onmessage?.(new MessageEvent('message', { data }))
        }, 10)
      }
    },
    close() {
      if (sock.readyState === WebSocket.CLOSED) return
      sock.readyState = WebSocket.CLOSED
      sock.onclose?.(new CloseEvent('close'))
    },
  }
  setTimeout(() => {
    sock.readyState = WebSocket.OPEN
    sock.onopen?.(new Event('open'))
    setTimeout(() => {
      sock.onmessage?.(new MessageEvent('message', {
        data: '\x1b[1;34mWelcome to the Dev Console demo terminal!\x1b[0m\r\n$ ',
      }))
    }, 20)
  }, 50)
  return sock
}

// ---------------------------------------------------------------------------
// EmbeddedTerminal — xterm.js terminal panel
// ---------------------------------------------------------------------------

function EmbeddedTerminal({ pid, wid, active }: { pid: string; wid: string; active: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      theme: {
        background: '#0f172a',
        foreground: '#f1f5f9',
        cursor: '#93c5fd',
        selectionBackground: '#2563eb66',
      },
      fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
      fontSize: 14,
      lineHeight: 1.4,
      cursorBlink: true,
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    fitAddon.fit()
    termRef.current = term
    fitRef.current = fitAddon

    term.write('\x1b[1;34mConnecting…\x1b[0m\r\n')

    let sock: SocketLike | null = null
    let disposed = false

    async function connect() {
      try {
        const res = await fetch(`/api/projects/${pid}/workspaces/${wid}/terminals`, {
          method: 'POST',
        })
        if (!res.ok) {
          term.write(`\x1b[1;31mFailed to create terminal session: HTTP ${res.status}\x1b[0m\r\n`)
          return
        }
        const { terminalId } = (await res.json()) as { terminalId: string }
        if (disposed) return

        if (import.meta.env.VITE_DEMO_MODE === 'true') {
          sock = createDemoSocket()
        } else {
          const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
          const wsUrl = `${proto}//${window.location.host}/api/projects/${pid}/workspaces/${wid}/terminals/${terminalId}`
          sock = new WebSocket(wsUrl)
          sock.binaryType = 'arraybuffer'
        }
        wsRef.current = sock as unknown as WebSocket

        sock.onopen = () => {
          if (disposed) { sock?.close(); return }
          const { cols, rows } = term
          sock!.send(JSON.stringify({ type: 'resize', cols, rows }))
        }
        sock.onmessage = (event) => {
          if (disposed) return
          if (event.data instanceof ArrayBuffer) {
            term.write(new Uint8Array(event.data))
          } else {
            term.write(event.data as string)
          }
        }
        sock.onclose = () => {
          if (!disposed) term.write('\r\n\x1b[1;33m[connection closed]\x1b[0m\r\n')
        }
        sock.onerror = () => {
          if (!disposed) term.write('\r\n\x1b[1;31m[connection error]\x1b[0m\r\n')
        }
        term.onData((data) => {
          if (sock?.readyState === WebSocket.OPEN) sock.send(data)
        })
      } catch (err) {
        if (!disposed) term.write(`\x1b[1;31mError: ${String(err)}\x1b[0m\r\n`)
      }
    }

    connect()

    function handleResize() {
      fitRef.current?.fit()
      const t = termRef.current
      const s = wsRef.current
      if (t && s?.readyState === WebSocket.OPEN) {
        s.send(JSON.stringify({ type: 'resize', cols: t.cols, rows: t.rows }))
      }
    }
    window.addEventListener('resize', handleResize)

    return () => {
      disposed = true
      window.removeEventListener('resize', handleResize)
      sock?.close()
      term.dispose()
      termRef.current = null
      fitRef.current = null
      wsRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid, wid])

  // Re-fit when the terminal panel becomes visible.
  useEffect(() => {
    if (active) {
      setTimeout(() => fitRef.current?.fit(), 10)
    }
  }, [active])

  return (
    <div style={{ flex: 1, padding: '0.5rem', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div ref={containerRef} style={{ flex: 1, overflow: 'hidden' }} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// ChangesPanel — placeholder for Phase 4 (Change Proposal & Review)
// ---------------------------------------------------------------------------

function ChangesPanel() {
  const s: Record<string, React.CSSProperties> = {
    panel: {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
    },
    empty: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.5rem',
      color: C.muted,
      fontSize: '0.875rem',
      padding: '2rem',
      textAlign: 'center',
    },
    icon: { fontSize: '2rem', opacity: 0.4 },
    label: { fontWeight: 600, color: C.text },
    sub: { color: C.muted, fontSize: '0.8125rem', lineHeight: 1.5, maxWidth: '20rem' },
  }

  return (
    <div style={s.panel}>
      <div style={s.empty}>
        <div style={s.icon} aria-hidden="true">≈</div>
        <div style={s.label}>No pending changes</div>
        <div style={s.sub}>
          When the agent proposes file changes you can review, accept, or reject
          them here. This feature is coming in a future update.
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// MobileNavDrawer — slide-in navigation drawer (mobile only)
// ---------------------------------------------------------------------------

interface WorkspaceInfo {
  id: string
  name: string
  branch: string
}

function MobileNavDrawer({
  pid,
  currentWid,
  onClose,
}: {
  pid: string
  currentWid: string
  onClose: () => void
}) {
  const navigate = useNavigate()
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/projects/${pid}/workspaces`)
      .then(r => r.ok ? r.json() as Promise<WorkspaceInfo[]> : Promise.reject(new Error()))
      .then(data => { if (!cancelled) setWorkspaces(data) })
      .catch(() => { /* ignore */ })
    return () => { cancelled = true }
  }, [pid])

  function activateOnKeyboard(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      ;(e.currentTarget as HTMLElement).click()
    }
  }

  const s: Record<string, React.CSSProperties> = {
    backdrop: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      zIndex: 30,
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
    drawerTitle: { fontWeight: 700, fontSize: '0.9375rem', color: C.text },
    closeBtn: {
      background: 'transparent',
      border: 'none',
      color: C.muted,
      fontSize: '1.125rem',
      cursor: 'pointer',
      padding: '0.25rem',
    },
    section: { padding: '0.625rem 0.875rem' },
    sectionLabel: {
      fontSize: '0.6875rem',
      color: C.muted,
      letterSpacing: '0.08em',
      fontWeight: 700,
      textTransform: 'uppercase',
      marginBottom: '0.375rem',
    },
    wsRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      padding: '0.5rem 0.625rem',
      borderRadius: '0.375rem',
      cursor: 'pointer',
      fontSize: '0.875rem',
      marginBottom: '0.125rem',
    },
    wsName: { fontWeight: 500, color: C.text },
    wsBranch: { fontSize: '0.75rem', color: C.muted, fontFamily: 'monospace' },
    divider: { borderColor: C.border, margin: '0.5rem 0' },
    backBtn: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      padding: '0.5rem 0.625rem',
      borderRadius: '0.375rem',
      cursor: 'pointer',
      fontSize: '0.875rem',
      color: C.muted,
      background: 'transparent',
      border: 'none',
      width: '100%',
      textAlign: 'left',
    },
  }

  return (
    <div
      style={s.backdrop}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Navigation drawer"
    >
      <div style={s.drawer} onClick={e => e.stopPropagation()}>
        <div style={s.drawerHeader}>
          <span style={s.drawerTitle}>{pid}</span>
          <button style={s.closeBtn} onClick={onClose} aria-label="Close drawer">✕</button>
        </div>

        <div style={s.section}>
          <div style={s.sectionLabel}>Workspaces</div>
          {workspaces.map(ws => (
            <div
              key={ws.id}
              style={{
                ...s.wsRow,
                background: ws.id === currentWid ? C.surfaceAlt : 'transparent',
              }}
              onClick={() => { navigate(`/projects/${pid}/workspaces/${ws.id}`); onClose() }}
              onKeyDown={activateOnKeyboard}
              role="button"
              tabIndex={0}
              aria-label={`Switch to workspace ${ws.name}`}
              aria-current={ws.id === currentWid ? 'page' : undefined}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.0625rem' }}>
                <span style={s.wsName}>{ws.name}</span>
                <span style={s.wsBranch}>{ws.branch}</span>
              </div>
            </div>
          ))}
        </div>

        <hr style={s.divider} />

        <div style={s.section}>
          <button
            style={s.backBtn}
            onClick={() => { navigate(`/projects/${pid}/workspaces`); onClose() }}
          >
            ← All workspaces
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab type and tab definitions
// ---------------------------------------------------------------------------

type WorkspaceTab = 'agent' | 'files' | 'changes' | 'terminal'

interface TabDef {
  id: WorkspaceTab
  icon: string
  label: string
}

const TABS: TabDef[] = [
  { id: 'agent',    icon: '💬', label: 'Agent' },
  { id: 'files',    icon: '📁', label: 'Files' },
  { id: 'changes',  icon: '≈',  label: 'Changes' },
  { id: 'terminal', icon: '>_', label: 'Terminal' },
]

// ---------------------------------------------------------------------------
// WorkspacePage
// ---------------------------------------------------------------------------

export default function WorkspacePage() {
  const { pid, wid } = useParams<{ pid: string; wid: string }>()
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('agent')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [treeOpen, setTreeOpen] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)

  useLayoutEffect(() => {
    function handle() { setIsMobile(window.innerWidth < 768) }
    window.addEventListener('resize', handle)
    return () => window.removeEventListener('resize', handle)
  }, [])

  function handleFileSelect(path: string) {
    setSelectedFile(path)
    setActiveTab('files')
  }

  if (!pid || !wid) return null

  // ---------------------------------------------------------------------------
  // Shared panel content (rendered once, toggled with display to keep
  // xterm.js and other stateful panels alive across tab switches)
  // ---------------------------------------------------------------------------

  function panelStyle(tab: WorkspaceTab): React.CSSProperties {
    return {
      display: activeTab === tab ? 'flex' : 'none',
      flexDirection: 'column',
      flex: 1,
      overflow: 'hidden',
    }
  }

  const panels = (
    <>
      {/* Agent panel */}
      <div style={panelStyle('agent')}>
        <ChatPanel pid={pid} wid={wid} />
      </div>

      {/* Files panel */}
      <div style={panelStyle('files')}>
        {isMobile ? (
          // Mobile: tree → viewer drill-down within the Files panel
          selectedFile ? (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0.375rem 0.75rem',
                background: C.surface,
                borderBottom: `1px solid ${C.border}`,
                gap: '0.375rem',
                flexShrink: 0,
              }}>
                <button
                  style={{ background: 'transparent', border: 'none', color: C.blueLight, fontSize: '0.875rem', cursor: 'pointer', padding: 0 }}
                  onClick={() => setSelectedFile(null)}
                  aria-label="Back to file tree"
                >
                  ‹ Files
                </button>
                <span style={{ color: C.muted, fontSize: '0.8125rem' }}>/</span>
                <span style={{ color: C.text, fontSize: '0.8125rem', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedFile}
                </span>
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <FileViewer pid={pid} wid={wid} path={selectedFile} />
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              <div style={{
                padding: '0.375rem 0.75rem',
                background: C.surface,
                borderBottom: `1px solid ${C.border}`,
                fontSize: '0.75rem',
                color: C.muted,
                fontWeight: 600,
                letterSpacing: '0.05em',
                flexShrink: 0,
              }}>
                FILES
              </div>
              <FileTree
                pid={pid}
                wid={wid}
                onFileSelect={handleFileSelect}
                selectedPath={selectedFile ?? undefined}
              />
            </div>
          )
        ) : (
          // Desktop: file viewer (tree is in the left sidebar)
          selectedFile ? (
            <FileViewer pid={pid} wid={wid} path={selectedFile} />
          ) : (
            <div style={{ padding: '2rem', color: C.muted, fontSize: '0.875rem' }}>
              Select a file from the tree to view its contents.
            </div>
          )
        )}
      </div>

      {/* Changes panel */}
      <div style={panelStyle('changes')}>
        <ChangesPanel />
      </div>

      {/* Terminal panel — always mounted to keep xterm alive */}
      <div style={panelStyle('terminal')}>
        <EmbeddedTerminal pid={pid} wid={wid} active={activeTab === 'terminal'} />
      </div>
    </>
  )

  // ---------------------------------------------------------------------------
  // Mobile layout
  // ---------------------------------------------------------------------------

  if (isMobile) {
    const s: Record<string, React.CSSProperties> = {
      page: {
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: C.bg,
        color: C.text,
        overflow: 'hidden',
      },
      topBar: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 1rem',
        height: '3rem',
        background: C.surface,
        borderBottom: `1px solid ${C.border}`,
        flexShrink: 0,
      },
      topLeft: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
      backBtn: {
        background: 'transparent',
        border: 'none',
        color: C.muted,
        fontSize: '1.25rem',
        cursor: 'pointer',
        padding: '0.25rem',
        lineHeight: 1,
      },
      title: { fontWeight: 600, fontSize: '0.9375rem', color: C.text },
      topRight: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
      widLabel: {
        fontSize: '0.75rem',
        color: C.muted,
        maxWidth: '7rem',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
      menuBtn: {
        background: 'transparent',
        border: 'none',
        color: C.text,
        fontSize: '1.25rem',
        cursor: 'pointer',
        padding: '0.25rem 0.375rem',
        lineHeight: 1,
      },
      content: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
      bottomBar: {
        display: 'flex',
        borderTop: `1px solid ${C.border}`,
        background: C.surface,
        flexShrink: 0,
      },
    }

    function mobileTabStyle(tab: WorkspaceTab): React.CSSProperties {
      const active = activeTab === tab
      return {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0.5rem 0 0.625rem',
        background: 'transparent',
        border: 'none',
        borderTop: `2px solid ${active ? C.blue : 'transparent'}`,
        cursor: 'pointer',
        gap: '0.125rem',
        color: active ? C.blueLight : C.muted,
      }
    }

    return (
      <div style={s.page}>
        {/* Top bar */}
        <header style={s.topBar}>
          <div style={s.topLeft}>
            <button
              style={s.backBtn}
              onClick={() => navigate(`/projects/${pid}/workspaces`)}
              aria-label="Back to workspaces"
            >
              ‹
            </button>
            <span style={s.title}>{pid}</span>
          </div>
          <div style={s.topRight}>
            <span style={s.widLabel}>{wid}</span>
            <button
              style={s.menuBtn}
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation drawer"
            >
              ≡
            </button>
          </div>
        </header>

        {/* Panel content */}
        <div style={s.content}>{panels}</div>

        {/* Bottom tab bar */}
        <nav style={s.bottomBar} aria-label="Workspace panels">
          {TABS.map(tab => (
            <button
              key={tab.id}
              style={mobileTabStyle(tab.id)}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-label={tab.label}
            >
              <span style={{ fontSize: '1.0625rem', lineHeight: 1 }} aria-hidden="true">{tab.icon}</span>
              <span style={{ fontSize: '0.6875rem', letterSpacing: '0.01em' }}>{tab.label}</span>
            </button>
          ))}
        </nav>

        {/* Navigation drawer */}
        {drawerOpen && (
          <MobileNavDrawer
            pid={pid}
            currentWid={wid}
            onClose={() => setDrawerOpen(false)}
          />
        )}
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Desktop layout
  // ---------------------------------------------------------------------------

  const s: Record<string, React.CSSProperties> = {
    page: {
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: C.bg,
      color: C.text,
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      padding: '0.5rem 1rem',
      background: C.surface,
      borderBottom: `1px solid ${C.border}`,
      flexShrink: 0,
    },
    backBtn: {
      background: 'transparent',
      border: `1px solid ${C.border}`,
      borderRadius: '0.375rem',
      color: C.muted,
      fontSize: '0.8125rem',
      padding: '0.25rem 0.5rem',
      cursor: 'pointer',
    },
    logo: { fontWeight: 700, fontSize: '1rem' },
    breadcrumb: { color: C.muted, fontSize: '0.8125rem' },
    body: {
      flex: 1,
      display: 'flex',
      overflow: 'hidden',
      position: 'relative',
    },
    sidebar: {
      width: treeOpen ? '220px' : '0',
      minWidth: treeOpen ? '220px' : '0',
      borderRight: `1px solid ${C.border}`,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      transition: 'min-width 0.15s, width 0.15s',
      flexShrink: 0,
    },
    sidebarHeader: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0.375rem 0.625rem',
      background: C.surface,
      borderBottom: `1px solid ${C.border}`,
      fontSize: '0.75rem',
      color: C.muted,
      fontWeight: 600,
      letterSpacing: '0.05em',
      flexShrink: 0,
    },
    toggleBtn: {
      position: 'absolute',
      left: treeOpen ? '220px' : '0',
      top: '50%',
      transform: 'translateY(-50%)',
      zIndex: 10,
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderLeft: 'none',
      borderRadius: '0 0.25rem 0.25rem 0',
      color: C.muted,
      cursor: 'pointer',
      padding: '0.375rem 0.25rem',
      fontSize: '0.625rem',
      lineHeight: 1,
      transition: 'left 0.15s',
    },
    right: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    },
    tabBar: {
      display: 'flex',
      background: C.surface,
      borderBottom: `1px solid ${C.border}`,
      flexShrink: 0,
    },
  }

  function desktopTabStyle(tab: WorkspaceTab): React.CSSProperties {
    const active = activeTab === tab
    return {
      padding: '0.5rem 1rem',
      fontSize: '0.8125rem',
      cursor: 'pointer',
      background: 'transparent',
      border: 'none',
      borderBottom: active ? `2px solid ${C.blue}` : '2px solid transparent',
      color: active ? C.text : C.muted,
      fontWeight: active ? 600 : 400,
      display: 'flex',
      alignItems: 'center',
      gap: '0.375rem',
    }
  }

  return (
    <div style={s.page}>
      {/* Header */}
      <header style={s.header}>
        <button
          style={s.backBtn}
          onClick={() => navigate(`/projects/${pid}/workspaces`)}
          aria-label="Back to workspaces"
        >
          ← Back
        </button>
        <span style={s.logo}>Dev Console</span>
        <span style={s.breadcrumb}>/</span>
        <span style={s.breadcrumb}>{pid}</span>
        <span style={s.breadcrumb}>/</span>
        <span style={s.breadcrumb}>{wid}</span>
      </header>

      {/* Body: sidebar + right panel */}
      <div style={s.body}>
        {/* Tree toggle button */}
        <button
          style={s.toggleBtn}
          onClick={() => setTreeOpen(v => !v)}
          aria-label={treeOpen ? 'Collapse file tree' : 'Expand file tree'}
        >
          {treeOpen ? '◂' : '▸'}
        </button>

        {/* Left sidebar */}
        <div style={s.sidebar}>
          {treeOpen && (
            <>
              <div style={s.sidebarHeader}>
                <span>FILES</span>
              </div>
              <FileTree
                pid={pid}
                wid={wid}
                onFileSelect={handleFileSelect}
                selectedPath={selectedFile ?? undefined}
              />
            </>
          )}
        </div>

        {/* Right panel */}
        <div style={s.right}>
          {/* Tab bar */}
          <div style={s.tabBar} role="tablist" aria-label="Workspace panels">
            {TABS.map(tab => (
              <button
                key={tab.id}
                style={desktopTabStyle(tab.id)}
                onClick={() => setActiveTab(tab.id)}
                role="tab"
                aria-selected={activeTab === tab.id}
              >
                <span aria-hidden="true">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Panel content */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {panels}
          </div>
        </div>
      </div>
    </div>
  )
}

