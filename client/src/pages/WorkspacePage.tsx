/**
 * WorkspacePage — split layout: collapsible file tree on the left, with a
 * tabbed panel on the right that switches between the file viewer, terminal,
 * and AI chat.
 *
 * Routes:
 *   /projects/:pid/workspaces/:wid
 */

import { useState, useEffect, useRef } from 'react'
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
  border: '#334155',
  text: '#f1f5f9',
  muted: '#94a3b8',
  blue: '#2563eb',
  blueLight: '#93c5fd',
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
// EmbeddedTerminal — xterm.js terminal panel (same logic as TerminalPage,
// but rendered inline rather than as a full-page route).
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
    // `connect` and `handleResize` are defined inside this effect, so they
    // capture fresh `pid`/`wid` values every time the effect re-runs; only
    // the external deps need to be listed.
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
// WorkspacePage
// ---------------------------------------------------------------------------

type RightTab = 'terminal' | 'file' | 'chat'

export default function WorkspacePage() {
  const { pid, wid } = useParams<{ pid: string; wid: string }>()
  const navigate = useNavigate()

  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<RightTab>('terminal')
  const [treeOpen, setTreeOpen] = useState(true)
  // Agent session ID — created lazily when the user first opens the Chat tab.
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionError, setSessionError] = useState<string | null>(null)

  function handleFileSelect(path: string) {
    setSelectedFile(path)
    setActiveTab('file')
  }

  // Create an agent session the first time the Chat tab is activated.
  async function handleChatTab() {
    setActiveTab('chat')
    if (sessionId) return
    try {
      const res = await fetch(`/api/projects/${pid}/workspaces/${wid}/sessions`, { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as { id: string }
      setSessionId(data.id)
    } catch (err) {
      setSessionError(String(err))
    }
  }

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
    },
    // Left sidebar (file tree)
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
    // Right panel
    right: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      position: 'relative',
    },
    tabBar: {
      display: 'flex',
      background: C.surface,
      borderBottom: `1px solid ${C.border}`,
      flexShrink: 0,
    },
    panelWrap: {
      flex: 1,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    },
  }

  function tabStyle(active: boolean): React.CSSProperties {
    return {
      padding: '0.5rem 1rem',
      fontSize: '0.8125rem',
      cursor: 'pointer',
      background: 'transparent',
      border: 'none',
      borderBottom: active ? `2px solid ${C.blue}` : '2px solid transparent',
      color: active ? C.text : C.muted,
      fontWeight: active ? 600 : 400,
    }
  }

  if (!pid || !wid) return null

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
      <div style={{ ...s.body, position: 'relative' }}>
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
          <div style={s.tabBar}>
            <button
              style={tabStyle(activeTab === 'terminal')}
              onClick={() => setActiveTab('terminal')}
              aria-selected={activeTab === 'terminal'}
            >
              Terminal
            </button>
            <button
              style={tabStyle(activeTab === 'file')}
              onClick={() => setActiveTab('file')}
              aria-selected={activeTab === 'file'}
              disabled={!selectedFile}
            >
              {selectedFile ? selectedFile.split('/').pop() : 'File'}
            </button>
            <button
              style={tabStyle(activeTab === 'chat')}
              onClick={handleChatTab}
              aria-selected={activeTab === 'chat'}
            >
              Chat
            </button>
          </div>

          <div style={{ ...s.panelWrap, display: activeTab === 'terminal' ? 'flex' : 'none' }}>
            <EmbeddedTerminal pid={pid} wid={wid} active={activeTab === 'terminal'} />
          </div>

          <div style={{ ...s.panelWrap, display: activeTab === 'file' ? 'flex' : 'none' }}>
            {selectedFile ? (
              <FileViewer pid={pid} wid={wid} path={selectedFile} />
            ) : (
              <div style={{ padding: '2rem', color: C.muted, fontSize: '0.875rem' }}>
                Select a file from the tree to view its contents.
              </div>
            )}
          </div>

          <div style={{ ...s.panelWrap, display: activeTab === 'chat' ? 'flex' : 'none' }}>
            {sessionError ? (
              <div style={{ padding: '2rem', color: '#f87171', fontSize: '0.875rem' }}>
                Failed to create chat session: {sessionError}
              </div>
            ) : sessionId ? (
              <ChatPanel pid={pid} wid={wid} sid={sessionId} />
            ) : (
              <div style={{ padding: '2rem', color: C.muted, fontSize: '0.875rem' }}>
                Starting chat session…
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
