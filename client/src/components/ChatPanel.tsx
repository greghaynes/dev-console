/**
 * ChatPanel — agent chat interface.
 *
 * Handles session selection, message history, and streaming agent responses.
 * Connects to the agent backend via:
 *   GET  /api/projects/:pid/workspaces/:wid/sessions
 *   POST /api/projects/:pid/workspaces/:wid/sessions
 *   WS   /api/projects/:pid/workspaces/:wid/sessions/:sid/chat
 *
 * WebSocket frame protocol (JSON text):
 *   Client → server: { "type": "user_message",   "content": "…" }
 *                    { "type": "cancel" }
 *   Server → client: { "type": "assistant_chunk", "content": "…" }
 *                    { "type": "tool_call",        "tool": "…", "args": {…} }
 *                    { "type": "tool_result",      "tool": "…", "content": "…" }
 *                    { "type": "assistant_done" }
 *
 * In demo mode (VITE_DEMO_MODE=true) a local fake socket scripts the responses
 * so that no real backend is needed (same pattern as EmbeddedTerminal).
 */

import { useState, useEffect, useRef } from 'react'

// ---------------------------------------------------------------------------
// Colour tokens
// ---------------------------------------------------------------------------

const C = {
  bg: '#0f172a',
  surface: '#1e293b',
  surfaceAlt: '#0c1829',
  border: '#334155',
  text: '#f1f5f9',
  muted: '#94a3b8',
  blue: '#2563eb',
  blueLight: '#93c5fd',
  green: '#22c55e',
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Session {
  id: string
  name: string
  status: 'active' | 'idle'
  createdAt: string
}

type Message =
  | { id: string; role: 'user'; content: string }
  | { id: string; role: 'assistant'; content: string; streaming: boolean }
  | { id: string; role: 'tool'; tool: string; args: string; result?: string }

export interface ChatPanelProps {
  pid: string
  wid: string
}

// ---------------------------------------------------------------------------
// Demo chat socket — scripts a canned agent response in-browser so no real
// backend is needed.  Mirrors the createDemoSocket pattern in WorkspacePage.
// ---------------------------------------------------------------------------

interface ChatSocketLike {
  readyState: number
  onopen: ((event: Event) => void) | null
  onmessage: ((event: MessageEvent) => void) | null
  onclose: ((event: CloseEvent) => void) | null
  send(data: string): void
  close(): void
}

const DEMO_REPLY_CHUNKS = [
  "I can see the workspace contains several files. ",
  "The `src/` directory has TypeScript source files ",
  "including `main.ts`, `utils.ts`, and a `components/` subdirectory. ",
  "There's also a `package.json` and a `README.md` at the root.\n\n",
  "What would you like to explore or work on?",
]

function createDemoChatSocket(): ChatSocketLike {
  const sock: ChatSocketLike = {
    readyState: WebSocket.CONNECTING,
    onopen: null,
    onmessage: null,
    onclose: null,
    send(data: string) {
      if (sock.readyState !== WebSocket.OPEN) return
      let msg: { type?: string }
      try { msg = JSON.parse(data) } catch { return }
      if (msg.type !== 'user_message') return

      function emit(frame: object, delay: number) {
        setTimeout(() => {
          sock.onmessage?.(new MessageEvent('message', { data: JSON.stringify(frame) }))
        }, delay)
      }

      let delay = 250
      emit({ type: 'tool_call', tool: 'list_files', args: { path: '' } }, delay); delay += 350
      emit({ type: 'tool_result', tool: 'list_files', content: 'README.md\npackage.json\nsrc/' }, delay); delay += 200
      for (const chunk of DEMO_REPLY_CHUNKS) {
        emit({ type: 'assistant_chunk', content: chunk }, delay); delay += 150
      }
      emit({ type: 'assistant_done' }, delay + 50)
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
  }, 50)
  return sock
}

// ---------------------------------------------------------------------------
// Style helpers (defined outside component to avoid recreating on each render)
// ---------------------------------------------------------------------------

function sessionChipStyle(active: boolean): React.CSSProperties {
  return {
    padding: '0.25rem 0.625rem',
    borderRadius: '999px',
    background: active ? '#1e3a5f' : 'transparent',
    border: `1px solid ${active ? C.blueLight : C.border}`,
    color: active ? C.blueLight : C.muted,
    fontSize: '0.75rem',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  }
}

function sendBtnStyle(canSend: boolean): React.CSSProperties {
  return {
    padding: '0.5rem 0.875rem',
    borderRadius: '0.5rem',
    border: 'none',
    background: canSend ? C.blue : C.surface,
    color: canSend ? '#fff' : C.muted,
    fontSize: '0.875rem',
    cursor: canSend ? 'pointer' : 'default',
    fontWeight: 600,
    flexShrink: 0,
    transition: 'background 0.1s',
  }
}

// ---------------------------------------------------------------------------
// ChatPanel
// ---------------------------------------------------------------------------

export default function ChatPanel({ pid, wid }: ChatPanelProps) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const wsRef = useRef<ChatSocketLike | null>(null)
  const feedRef = useRef<HTMLDivElement>(null)
  const didAutoSelect = useRef(false)

  // Fetch sessions on mount
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/projects/${pid}/workspaces/${wid}/sessions`)
        if (!res.ok || cancelled) return
        const data = (await res.json()) as Session[]
        setSessions(data)
        if (!didAutoSelect.current && data.length > 0) {
          didAutoSelect.current = true
          setCurrentSessionId(data[0].id)
        }
      } catch { /* ignore */ }
    }
    load()
    return () => { cancelled = true }
  }, [pid, wid])

  // Open WebSocket (or demo socket) when the active session changes
  useEffect(() => {
    if (!currentSessionId) return
    wsRef.current?.close()
    wsRef.current = null
    setStreaming(false)

    let socket: ChatSocketLike
    if (import.meta.env.VITE_DEMO_MODE === 'true') {
      socket = createDemoChatSocket()
    } else {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const url = `${proto}//${window.location.host}/api/projects/${pid}/workspaces/${wid}/sessions/${currentSessionId}/chat`
      socket = new WebSocket(url)
    }
    wsRef.current = socket

    socket.onmessage = (event) => {
      let frame: { type: string; content?: string; tool?: string; args?: Record<string, string> }
      try { frame = JSON.parse(event.data as string) } catch { return }

      if (frame.type === 'assistant_chunk') {
        const chunk = frame.content ?? ''
        setMessages(prev => {
          const last = prev[prev.length - 1]
          if (last && last.role === 'assistant' && last.streaming) {
            return [...prev.slice(0, -1), { ...last, content: last.content + chunk }]
          }
          return [...prev, { id: `asst-${Date.now()}`, role: 'assistant', content: chunk, streaming: true }]
        })
      } else if (frame.type === 'assistant_done') {
        setMessages(prev => {
          const last = prev[prev.length - 1]
          if (last && last.role === 'assistant' && last.streaming) {
            return [...prev.slice(0, -1), { ...last, streaming: false }]
          }
          return prev
        })
        setStreaming(false)
      } else if (frame.type === 'tool_call') {
        const argsStr = frame.args
          ? Object.entries(frame.args)
              .map(([k, v]) => `${k}: ${v}`)
              .join(', ')
          : ''
        setMessages(prev => [
          ...prev,
          { id: `tool-${Date.now()}`, role: 'tool', tool: frame.tool ?? 'tool', args: argsStr },
        ])
      } else if (frame.type === 'tool_result') {
        setMessages(prev => {
          // Attach result to the last tool message that has no result yet
          const idx = [...prev]
            .reverse()
            .findIndex(m => m.role === 'tool' && !('result' in m && m.result !== undefined))
          if (idx === -1) return prev
          const realIdx = prev.length - 1 - idx
          const updated = { ...(prev[realIdx] as Extract<Message, { role: 'tool' }>) }
          updated.result = frame.content ?? ''
          return [...prev.slice(0, realIdx), updated, ...prev.slice(realIdx + 1)]
        })
      }
    }

    socket.onclose = () => setStreaming(false)

    return () => {
      socket.close()
      wsRef.current = null
    }
  }, [pid, wid, currentSessionId])

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    const el = feedRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  async function createSession() {
    try {
      const res = await fetch(`/api/projects/${pid}/workspaces/${wid}/sessions`, { method: 'POST' })
      if (!res.ok) return
      const session = (await res.json()) as Session
      setSessions(prev => [...prev, session])
      setCurrentSessionId(session.id)
      setMessages([])
    } catch { /* ignore */ }
  }

  function sendMessage() {
    const text = input.trim()
    const sock = wsRef.current
    if (!text || streaming || !sock || sock.readyState !== WebSocket.OPEN) return
    setMessages(prev => [...prev, { id: `user-${Date.now()}`, role: 'user', content: text }])
    sock.send(JSON.stringify({ type: 'user_message', content: text }))
    setStreaming(true)
    setInput('')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function switchSession(id: string) {
    if (id === currentSessionId) return
    setCurrentSessionId(id)
    setMessages([])
  }

  const s: Record<string, React.CSSProperties> = {
    panel: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
    sessionBar: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.375rem',
      padding: '0.375rem 0.625rem',
      background: C.surface,
      borderBottom: `1px solid ${C.border}`,
      flexShrink: 0,
      overflowX: 'auto',
    },
    newSessionBtn: {
      padding: '0.25rem 0.5rem',
      borderRadius: '999px',
      background: 'transparent',
      border: `1px solid ${C.border}`,
      color: C.muted,
      fontSize: '0.75rem',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      flexShrink: 0,
    },
    feed: {
      flex: 1,
      overflowY: 'auto',
      padding: '0.75rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.625rem',
    },
    empty: {
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: '0.75rem',
      color: C.muted,
      fontSize: '0.875rem',
      padding: '2rem',
      textAlign: 'center',
    },
    noSessionPrompt: {
      padding: '0.5rem 1rem',
      borderRadius: '0.375rem',
      border: `1px solid ${C.blueLight}`,
      background: 'transparent',
      color: C.blueLight,
      fontSize: '0.875rem',
      cursor: 'pointer',
    },
    hint: {
      color: C.muted,
      fontSize: '0.8125rem',
      padding: '0.25rem 0',
      textAlign: 'center',
    },
    userMsg: {
      alignSelf: 'flex-end',
      maxWidth: '80%',
      background: C.blue,
      color: '#fff',
      padding: '0.5rem 0.875rem',
      borderRadius: '1rem 1rem 0.25rem 1rem',
      fontSize: '0.875rem',
      lineHeight: 1.5,
    },
    assistantWrap: { maxWidth: '88%', display: 'flex', flexDirection: 'column', gap: '0.25rem' },
    roleLabel: { fontSize: '0.6875rem', color: C.muted, letterSpacing: '0.03em' },
    assistantBubble: {
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: '0 0.5rem 0.5rem 0.5rem',
      padding: '0.625rem 0.875rem',
      fontSize: '0.875rem',
      color: C.text,
      lineHeight: 1.5,
      whiteSpace: 'pre-wrap',
    },
    cursor: {
      display: 'inline-block',
      width: '0.5rem',
      height: '0.875em',
      background: C.blueLight,
      verticalAlign: 'text-bottom',
    },
    toolWrap: { maxWidth: '88%', display: 'flex', flexDirection: 'column', gap: '0.125rem' },
    toolBubble: {
      background: C.surfaceAlt,
      border: `1px solid ${C.border}`,
      borderRadius: '0.5rem',
      padding: '0.5rem 0.75rem',
      fontSize: '0.8125rem',
      fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
      color: C.muted,
    },
    toolHeader: {
      color: C.blueLight,
      marginBottom: '0.125rem',
      fontFamily: 'sans-serif',
      fontSize: '0.75rem',
      fontWeight: 600,
    },
    toolResult: { marginTop: '0.25rem', color: '#6b8597', borderTop: `1px solid ${C.border}`, paddingTop: '0.25rem' },
    inputArea: {
      display: 'flex',
      gap: '0.5rem',
      padding: '0.5rem 0.75rem',
      borderTop: `1px solid ${C.border}`,
      background: C.surface,
      flexShrink: 0,
    },
    inputBox: {
      flex: 1,
      padding: '0.5rem 0.75rem',
      borderRadius: '0.5rem',
      border: `1px solid ${C.border}`,
      background: C.bg,
      color: C.text,
      fontSize: '0.875rem',
      resize: 'none',
      outline: 'none',
      fontFamily: 'inherit',
      lineHeight: 1.5,
    },
  }

  const canSend = !streaming && input.trim().length > 0 && !!wsRef.current

  if (sessions.length === 0) {
    return (
      <div style={s.panel}>
        <div style={s.empty}>
          <div>No agent sessions yet</div>
          <button style={s.noSessionPrompt} onClick={createSession}>
            + Start a session
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={s.panel}>
      {/* Session selector */}
      <div style={s.sessionBar} role="tablist" aria-label="Agent sessions">
        {sessions.map(sess => (
          <button
            key={sess.id}
            style={sessionChipStyle(sess.id === currentSessionId)}
            onClick={() => switchSession(sess.id)}
            role="tab"
            aria-selected={sess.id === currentSessionId}
            aria-label={`Session: ${sess.name}`}
          >
            {sess.status === 'active' && (
              <span style={{ color: C.green, marginRight: '0.25rem' }} aria-hidden="true">●</span>
            )}
            {sess.name}
          </button>
        ))}
        <button style={s.newSessionBtn} onClick={createSession} aria-label="New agent session">
          + New
        </button>
      </div>

      {/* Message feed */}
      <div
        ref={feedRef}
        style={s.feed}
        role="log"
        aria-label="Conversation"
        aria-live="polite"
      >
        {messages.length === 0 && (
          <div style={s.hint}>Ask the agent anything about this workspace.</div>
        )}

        {messages.map(msg => {
          if (msg.role === 'user') {
            return (
              <div key={msg.id} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={s.userMsg}>{msg.content}</div>
              </div>
            )
          }

          if (msg.role === 'assistant') {
            return (
              <div key={msg.id} style={s.assistantWrap}>
                <div style={s.roleLabel}>assistant</div>
                <div style={s.assistantBubble}>
                  {msg.content}
                  {msg.streaming && <span style={s.cursor} aria-hidden="true" />}
                </div>
              </div>
            )
          }

          if (msg.role === 'tool') {
            return (
              <div key={msg.id} style={s.toolWrap}>
                <div style={s.toolBubble}>
                  <div style={s.toolHeader}>tool · {msg.tool}</div>
                  {msg.args && <div>{msg.args}</div>}
                  {msg.result !== undefined && (
                    <div style={s.toolResult}>↳ {msg.result}</div>
                  )}
                </div>
              </div>
            )
          }

          return null
        })}
      </div>

      {/* Input bar */}
      <div style={s.inputArea}>
        <textarea
          style={s.inputBox}
          placeholder="Ask the agent…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={streaming || !currentSessionId}
          aria-label="Message input"
          rows={1}
        />
        <button
          style={sendBtnStyle(canSend)}
          onClick={sendMessage}
          disabled={!canSend}
          aria-label="Send message"
        >
          Send
        </button>
      </div>
    </div>
  )
}
