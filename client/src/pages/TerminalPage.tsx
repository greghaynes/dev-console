/**
 * TerminalPage — creates a terminal session and renders an xterm.js terminal
 * connected to it via WebSocket.
 *
 * Lifecycle:
 *   1. POST /api/projects/:pid/workspaces/:wid/terminals to create a session.
 *   2. Open a WebSocket at WS /api/projects/:pid/workspaces/:wid/terminals/:tid.
 *      In demo mode (VITE_DEMO_MODE) an in-process echo socket is used instead.
 *   3. Send an initial resize JSON control frame once the terminal is ready.
 *   4. Pipe terminal input to the WebSocket and WebSocket data to the terminal.
 *   5. On window resize: re-fit and send updated dimensions.
 *   6. On unmount: close WebSocket and dispose the terminal.
 */

import { useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

const C = {
  bg: '#0f172a',
  surface: '#1e293b',
  border: '#334155',
  text: '#f1f5f9',
  muted: '#94a3b8',
  blue: '#2563eb',
  blueLight: '#93c5fd',
}

// ---------------------------------------------------------------------------
// Minimal interface that both the real WebSocket and the in-process demo echo
// socket implement, so TerminalPage can treat them uniformly.
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

/**
 * createDemoSocket returns a minimal in-process echo socket used in demo mode.
 *
 * On "open" it sends a welcome banner.  All subsequent input is echoed back
 * verbatim, except JSON resize control frames which are silently discarded.
 * No system processes are spawned.
 */
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
      // Silently discard JSON resize control messages.
      if (typeof data === 'string') {
        try {
          const msg = JSON.parse(data) as { type?: string }
          if (msg.type === 'resize') return
        } catch { /* not JSON — echo it */ }
        // Echo the text back after a tiny delay.
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

  // Fire open + welcome banner on next tick so handlers are set first.
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

export default function TerminalPage() {
  const { pid, wid } = useParams<{ pid: string; wid: string }>()
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!pid || !wid || !containerRef.current) return

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
        // 1. Create terminal session (MSW or real server).
        const res = await fetch(`/api/projects/${pid}/workspaces/${wid}/terminals`, {
          method: 'POST',
        })
        if (!res.ok) {
          term.write(`\x1b[1;31mFailed to create terminal session: HTTP ${res.status}\x1b[0m\r\n`)
          return
        }
        const { terminalId } = (await res.json()) as { terminalId: string }

        if (disposed) return

        // 2. Open WebSocket (or demo in-process echo socket).
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
          // 3. Send initial resize.
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
          if (!disposed) {
            term.write('\r\n\x1b[1;33m[connection closed]\x1b[0m\r\n')
          }
        }

        sock.onerror = () => {
          if (!disposed) {
            term.write('\r\n\x1b[1;31m[connection error]\x1b[0m\r\n')
          }
        }

        // 4. Forward terminal input to the socket.
        term.onData((data) => {
          if (sock?.readyState === WebSocket.OPEN) {
            sock.send(data)
          }
        })
      } catch (err) {
        if (!disposed) {
          term.write(`\x1b[1;31mError: ${String(err)}\x1b[0m\r\n`)
        }
      }
    }

    connect()

    // 5. Handle window resize.
    function handleResize() {
      fitRef.current?.fit()
      const t = termRef.current
      const s = wsRef.current
      if (t && s?.readyState === WebSocket.OPEN) {
        s.send(JSON.stringify({ type: 'resize', cols: t.cols, rows: t.rows }))
      }
    }
    window.addEventListener('resize', handleResize)

    // 6. Cleanup on unmount.
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

  const s: Record<string, React.CSSProperties> = {
    page: { display: 'flex', flexDirection: 'column', height: '100vh', background: C.bg, color: C.text },
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
    tag: {
      padding: '0.125rem 0.5rem',
      borderRadius: '0.25rem',
      background: '#1e3a5f',
      color: C.blueLight,
      fontSize: '0.6875rem',
      fontWeight: 600,
    },
    termWrap: {
      flex: 1,
      padding: '0.5rem',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    },
    termContainer: {
      flex: 1,
      overflow: 'hidden',
    },
  }

  return (
    <div style={s.page}>
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
        <span style={s.tag}>Terminal</span>
      </header>
      <div style={s.termWrap}>
        <div ref={containerRef} style={s.termContainer} />
      </div>
    </div>
  )
}
