/**
 * ChatPanel — AI assistant chat panel for a workspace session.
 *
 * Connects to WS /api/projects/:pid/workspaces/:wid/sessions/:sid/chat,
 * streams assistant responses in real time (markdown rendered via
 * react-markdown), and shows collapsible tool-use blocks.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'

// ---------------------------------------------------------------------------
// Colour tokens (match existing pages)
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
  green: '#4ade80',
  yellow: '#fbbf24',
  red: '#f87171',
  toolBg: '#162032',
}

// ---------------------------------------------------------------------------
// WebSocket event types
// ---------------------------------------------------------------------------

interface AssistantChunk   { type: 'assistant_chunk'; content: string }
interface ToolCallFrame    { type: 'tool_call'; id: string; name: string; arguments: string }
interface ToolResultFrame  { type: 'tool_result'; id: string; content: string }
interface AssistantDone    { type: 'assistant_done' }
interface ErrorFrame       { type: 'error'; message: string }

type ServerFrame = AssistantChunk | ToolCallFrame | ToolResultFrame | AssistantDone | ErrorFrame

// ---------------------------------------------------------------------------
// Message display model
// ---------------------------------------------------------------------------

interface UserMessage {
  role: 'user'
  content: string
}

interface AssistantMessage {
  role: 'assistant'
  content: string   // accumulated streaming text
  done: boolean
  toolUses: ToolUse[]
}

interface ToolUse {
  id: string
  name: string
  arguments: string
  result: string | null
}

type ChatMessage = UserMessage | AssistantMessage

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ChatPanelProps {
  pid: string
  wid: string
  sid: string
}

// ---------------------------------------------------------------------------
// ToolUseBlock — collapsible tool call + result display
// ---------------------------------------------------------------------------

function ToolUseBlock({ toolUse }: { toolUse: ToolUse }) {
  const [open, setOpen] = useState(false)

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    padding: '0.25rem 0.5rem',
    background: C.toolBg,
    border: `1px solid ${C.border}`,
    borderRadius: open ? '0.375rem 0.375rem 0 0' : '0.375rem',
    cursor: 'pointer',
    fontSize: '0.75rem',
    color: C.muted,
    userSelect: 'none',
  }
  const bodyStyle: React.CSSProperties = {
    padding: '0.5rem',
    background: C.toolBg,
    border: `1px solid ${C.border}`,
    borderTop: 'none',
    borderRadius: '0 0 0.375rem 0.375rem',
    fontSize: '0.75rem',
    fontFamily: 'Menlo, Monaco, Consolas, monospace',
    color: C.muted,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(v => !v) }
  }

  return (
    <div style={{ margin: '0.375rem 0' }}>
      <div
        style={headerStyle}
        onClick={() => setOpen(v => !v)}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={`${open ? 'Collapse' : 'Expand'} tool use: ${toolUse.name}`}
      >
        <span style={{ color: C.yellow }}>⚙</span>
        <span style={{ color: C.blueLight }}>{toolUse.name}</span>
        {toolUse.result === null && (
          <span style={{ color: C.yellow, marginLeft: 'auto' }}>running…</span>
        )}
        {toolUse.result !== null && (
          <span style={{ color: C.green, marginLeft: 'auto' }}>done</span>
        )}
        <span style={{ marginLeft: '0.25rem' }}>{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <div style={bodyStyle}>
          <div style={{ marginBottom: '0.25rem', color: C.muted }}>
            <strong>Arguments:</strong> {toolUse.arguments || '{}'}
          </div>
          {toolUse.result !== null && (
            <div>
              <strong>Result:</strong>
              {'\n'}{toolUse.result}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ChatPanel
// ---------------------------------------------------------------------------

export default function ChatPanel({ pid, wid, sid }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [connected, setConnected] = useState(false)
  const [running, setRunning] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom when messages change.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Open WebSocket on mount.
  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${proto}//${window.location.host}/api/projects/${pid}/workspaces/${wid}/sessions/${sid}/chat`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => { setConnected(false); setRunning(false) }
    ws.onerror = () => { setConnected(false); setRunning(false) }

    ws.onmessage = (event) => {
      let frame: ServerFrame
      try {
        frame = JSON.parse(event.data as string) as ServerFrame
      } catch {
        return
      }

      switch (frame.type) {
        case 'assistant_chunk':
          setMessages(prev => {
            const last = prev[prev.length - 1]
            if (last && last.role === 'assistant' && !last.done) {
              const updated: AssistantMessage = { ...last, content: last.content + frame.content }
              return [...prev.slice(0, -1), updated]
            }
            // Start new assistant message.
            return [...prev, { role: 'assistant', content: frame.content, done: false, toolUses: [] }]
          })
          break

        case 'tool_call':
          setMessages(prev => {
            const last = prev[prev.length - 1]
            const toolUse: ToolUse = { id: frame.id, name: frame.name, arguments: frame.arguments, result: null }
            if (last && last.role === 'assistant' && !last.done) {
              const updated: AssistantMessage = { ...last, toolUses: [...last.toolUses, toolUse] }
              return [...prev.slice(0, -1), updated]
            }
            return [...prev, { role: 'assistant', content: '', done: false, toolUses: [toolUse] }]
          })
          break

        case 'tool_result':
          setMessages(prev => {
            const last = prev[prev.length - 1]
            if (last && last.role === 'assistant') {
              const updatedToolUses = last.toolUses.map(tu =>
                tu.id === frame.id ? { ...tu, result: frame.content } : tu
              )
              return [...prev.slice(0, -1), { ...last, toolUses: updatedToolUses }]
            }
            return prev
          })
          break

        case 'assistant_done':
          setMessages(prev => {
            const last = prev[prev.length - 1]
            if (last && last.role === 'assistant') {
              return [...prev.slice(0, -1), { ...last, done: true }]
            }
            return prev
          })
          setRunning(false)
          break

        case 'error':
          setMessages(prev => [
            ...prev,
            { role: 'assistant', content: `⚠ Error: ${frame.message}`, done: true, toolUses: [] },
          ])
          setRunning(false)
          break
      }
    }

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [pid, wid, sid])

  const sendMessage = useCallback(() => {
    const content = input.trim()
    if (!content || !connected || running) return

    wsRef.current?.send(JSON.stringify({ type: 'user_message', content }))
    setMessages(prev => [...prev, { role: 'user', content }])
    setInput('')
    setRunning(true)
  }, [input, connected, running])

  const cancelTurn = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'cancel' }))
    setRunning(false)
  }, [])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------

  const s: Record<string, React.CSSProperties> = {
    panel: {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: C.bg,
      color: C.text,
      overflow: 'hidden',
    },
    messageList: {
      flex: 1,
      overflowY: 'auto',
      padding: '1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem',
    },
    statusBar: {
      padding: '0.25rem 1rem',
      fontSize: '0.6875rem',
      color: connected ? C.green : C.red,
      background: C.surface,
      borderTop: `1px solid ${C.border}`,
      flexShrink: 0,
    },
    inputRow: {
      display: 'flex',
      gap: '0.5rem',
      padding: '0.75rem',
      background: C.surface,
      borderTop: `1px solid ${C.border}`,
      flexShrink: 0,
      alignItems: 'flex-end',
    },
    textarea: {
      flex: 1,
      resize: 'none',
      background: C.bg,
      border: `1px solid ${C.border}`,
      borderRadius: '0.375rem',
      color: C.text,
      fontSize: '0.875rem',
      padding: '0.5rem 0.625rem',
      outline: 'none',
      fontFamily: 'inherit',
      lineHeight: 1.5,
      minHeight: '2.5rem',
      maxHeight: '8rem',
    },
    sendBtn: {
      padding: '0.5rem 1rem',
      background: C.blue,
      border: 'none',
      borderRadius: '0.375rem',
      color: '#fff',
      fontSize: '0.875rem',
      cursor: 'pointer',
      flexShrink: 0,
      opacity: (!connected || running || !input.trim()) ? 0.5 : 1,
    },
    cancelBtn: {
      padding: '0.5rem 0.75rem',
      background: 'transparent',
      border: `1px solid ${C.border}`,
      borderRadius: '0.375rem',
      color: C.muted,
      fontSize: '0.875rem',
      cursor: 'pointer',
      flexShrink: 0,
    },
  }

  // ---------------------------------------------------------------------------
  // Message bubble renderer
  // ---------------------------------------------------------------------------

  function renderMessage(msg: ChatMessage, idx: number) {
    if (msg.role === 'user') {
      return (
        <div key={idx} style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{
            background: C.blue,
            color: '#fff',
            borderRadius: '0.75rem 0.75rem 0 0.75rem',
            padding: '0.625rem 0.875rem',
            maxWidth: '80%',
            fontSize: '0.875rem',
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {msg.content}
          </div>
        </div>
      )
    }

    // assistant message
    return (
      <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxWidth: '90%' }}>
        {msg.toolUses.map(tu => (
          <ToolUseBlock key={tu.id} toolUse={tu} />
        ))}
        {(msg.content || (!msg.done && msg.toolUses.length === 0)) && (
          <div style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: '0.75rem 0.75rem 0.75rem 0',
            padding: '0.625rem 0.875rem',
            fontSize: '0.875rem',
            lineHeight: 1.6,
            color: C.text,
          }}>
            <div className="chat-markdown">
              <ReactMarkdown>{msg.content || (msg.done ? '' : '▍')}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div style={s.panel}>
      <div style={s.messageList} role="log" aria-label="Chat messages" aria-live="polite">
        {messages.length === 0 && (
          <div style={{ color: C.muted, fontSize: '0.875rem', textAlign: 'center', paddingTop: '2rem' }}>
            Ask the assistant anything about this workspace.
          </div>
        )}
        {messages.map((msg, idx) => renderMessage(msg, idx))}
        <div ref={bottomRef} />
      </div>

      <div style={s.statusBar}>
        {connected ? '● connected' : '○ disconnected'}
      </div>

      <div style={s.inputRow}>
        <textarea
          style={s.textarea}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about the workspace… (Enter to send, Shift+Enter for newline)"
          rows={1}
          aria-label="Chat input"
          disabled={!connected || running}
        />
        {running ? (
          <button
            style={s.cancelBtn}
            onClick={cancelTurn}
            aria-label="Cancel current response"
          >
            Cancel
          </button>
        ) : (
          <button
            style={s.sendBtn}
            onClick={sendMessage}
            disabled={!connected || running || !input.trim()}
            aria-label="Send message"
          >
            Send
          </button>
        )}
      </div>
    </div>
  )
}
